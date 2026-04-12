/** @odoo-module */

import { onMounted, onWillStart } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";

const DEFAULT_COLOR_GROUP_COUNT = 8;
const DLC_STYLE_TAG_ID = "o-dlc-runtime-colors";
const dlcDocumentGroupIndexCache = new Map();
const DLC_DEFAULT_SCOPE = {
    apply_sale: false,
    apply_purchase: false,
    apply_invoice: false,
    apply_picking_outgoing: false,
    apply_picking_incoming: false,
    apply_picking_internal: false,
};

function normalizeColorRecord(record) {
    return {
        backgroundColor: record.background_color,
        borderColor: record.border_color,
        hoverColor: record.hover_color,
    };
}

function getScssFallbackColorGroupCount() {
    const rawValue = getComputedStyle(document.documentElement).getPropertyValue("--o-dlc-color-count");
    const count = Number.parseInt(rawValue, 10);
    return Number.isInteger(count) && count > 0 ? count : DEFAULT_COLOR_GROUP_COUNT;
}

function buildRuntimeColorCss(palette) {
    return palette
        .map((color, index) => {
            const groupNumber = index + 1;
            return `
.o_list_renderer .o_data_row.o_dlc_row.o_dlc_group_${groupNumber} > .o_data_cell {
    background-color: ${color.backgroundColor} !important;
    transition: background-color 0.15s ease;
}

.o_list_renderer .o_data_row.o_dlc_row.o_dlc_group_${groupNumber} > .o_data_cell:first-of-type {
    box-shadow: inset 4px 0 0 ${color.borderColor} !important;
}

.o_list_renderer .o_data_row.o_dlc_row.o_dlc_group_${groupNumber}:hover > .o_data_cell,
.o_list_renderer .o_data_row.o_dlc_row.o_dlc_group_${groupNumber}.o_list_record_selected > .o_data_cell {
    background-color: ${color.hoverColor} !important;
}`;
        })
        .join("\n");
}

function getM2oId(value) {
    return Array.isArray(value) ? value[0] : value?.id || value;
}

function getDocumentCacheKey(record, ctx) {
    const rootModel = record.model?.root?.resModel;
    const rootId = record.model?.root?.resId;
    if (rootModel && rootId) {
        return `${rootModel}:${rootId}`;
    }

    const linkedDocumentId =
        getM2oId(record.data.picking_id) ||
        getM2oId(record.data.order_id) ||
        getM2oId(record.data.move_id) ||
        getM2oId(record.data.purchase_id) ||
        ctx.active_id ||
        "unknown";
    const modelKey = rootModel || ctx.active_model || record.resModel;
    return `${modelKey}:${linkedDocumentId}`;
}

function getOrInitGroupIndexForProduct(record, ctx, duplicatePids) {
    const documentKey = getDocumentCacheKey(record, ctx);
    if (!dlcDocumentGroupIndexCache.has(documentKey)) {
        dlcDocumentGroupIndexCache.set(documentKey, new Map());
    }
    const documentMap = dlcDocumentGroupIndexCache.get(documentKey);

    // Assign new products in deterministic order, while keeping existing assignments unchanged.
    const missing = duplicatePids.filter((id) => !documentMap.has(id)).sort((a, b) => a - b);
    for (const pid of missing) {
        documentMap.set(pid, documentMap.size + 1);
    }

    return documentMap;
}

patch(ListRenderer.prototype, {                         //  OWL component -> rendering list/tree views
    setup() {
        super.setup(...arguments);
        this.dlcPalette = [];
        this.dlcColorGroupCount = getScssFallbackColorGroupCount();
        this.dlcScope = { ...DLC_DEFAULT_SCOPE };

        onWillStart(async () => {
            await Promise.all([
                this._dlcLoadPaletteFromDb(),
                this._dlcLoadScopeFromDb(),
            ]);
        });

        onMounted(() => {
            this._dlcInjectRuntimeStyles();
        });
    },

    async _dlcLoadPaletteFromDb() {
        const orm = this.env?.services?.orm;
        if (!orm) {
            return;
        }

        try {
            const records = await orm.searchRead(
                "line.color",
                [["active", "=", true]],
                ["background_color", "border_color", "hover_color"],
                { order: "sequence,id" }
            );
            this.dlcPalette = records
                .filter((record) => record.background_color && record.border_color && record.hover_color)
                .map(normalizeColorRecord);
            if (this.dlcPalette.length) {
                this.dlcColorGroupCount = this.dlcPalette.length;
            }
            this._dlcInjectRuntimeStyles();
        } catch {
            this.dlcPalette = [];
            this.dlcColorGroupCount = getScssFallbackColorGroupCount();
        }
    },

    async _dlcLoadScopeFromDb() {
        const orm = this.env?.services?.orm;
        if (!orm) {
            return;
        }

        try {
            const [config] = await orm.searchRead(
                "line.color.config",
                [["active", "=", true]],
                Object.keys(DLC_DEFAULT_SCOPE),
                { order: "id", limit: 1 }
            );

            if (!config) {
                this.dlcScope = { ...DLC_DEFAULT_SCOPE };
                return;
            }

            this.dlcScope = {
                apply_sale: !!config.apply_sale,
                apply_purchase: !!config.apply_purchase,
                apply_invoice: !!config.apply_invoice,
                apply_picking_outgoing: !!config.apply_picking_outgoing,
                apply_picking_incoming: !!config.apply_picking_incoming,
                apply_picking_internal: !!config.apply_picking_internal,
            };
        } catch {
            this.dlcScope = { ...DLC_DEFAULT_SCOPE };
        }
    },

    _dlcIsRecordInEnabledScope(record) {
        const ctx = record.model?.config?.context || {};

        if (["stock.move", "stock.move.line"].includes(record.resModel)) {
            const inPickingScope =
                record.model?.root?.resModel === "stock.picking" ||
                ctx.active_model === "stock.picking" ||
                !!ctx.default_picking_id;
            if (!inPickingScope) {
                return false;
            }

            const pickingCode =
                record.data.picking_code ||
                record.data.picking_type_code ||
                record.model?.root?.data?.picking_type_code ||
                ctx.picking_type_code ||
                ctx.default_picking_type_code;

            if (pickingCode === "outgoing") {
                return this.dlcScope.apply_picking_outgoing;
            }
            if (pickingCode === "incoming") {
                return this.dlcScope.apply_picking_incoming;
            }
            if (pickingCode === "internal") {
                return this.dlcScope.apply_picking_internal;
            }
            return false;
        }

        if (record.resModel === "sale.order.line") {
            return this.dlcScope.apply_sale;
        }

        if (record.resModel === "purchase.order.line") {
            return this.dlcScope.apply_purchase;
        }

        if (record.resModel === "account.move.line") {
            if (!this.dlcScope.apply_invoice) {
                return false;
            }
            const moveType =
                record.data.move_type ||
                record.model?.root?.data?.move_type ||
                ctx.default_move_type;
            return ["out_invoice", "out_refund", "in_invoice", "in_refund"].includes(moveType);
        }

        return false;
    },

    _dlcInjectRuntimeStyles() {
        if (!this.dlcPalette.length) {
            return;
        }
        let styleTag = document.getElementById(DLC_STYLE_TAG_ID);
        if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = DLC_STYLE_TAG_ID;
            document.head.appendChild(styleTag);
        }
        styleTag.textContent = buildRuntimeColorCss(this.dlcPalette);
    },

    getRowClass(record) {                               //  compute CSS classes for each row
        const cls = super.getRowClass(...arguments) || "";

        if (!this._dlcIsRecordInEnabledScope(record)) return cls;

        const ctx = record.model?.config?.context || {};

        const pid = getM2oId(record.data.product_id);
        if (!pid) return cls;

        // Get all product IDs currently in the list
        const allPids = this.props.list.records.map((r) => getM2oId(r.data.product_id)).filter(Boolean);

        // If product appears less than twice, no extra color needed
        if (allPids.filter(id => id === pid).length < 2) return cls;

        // Keep group numbering stable by first appearance in the current list.
        // Sorting by product ID can reshuffle existing groups when new lines are added.
        const pidCounts = allPids.reduce((acc, id) => {
            acc[id] = (acc[id] || 0) + 1;
            return acc;
        }, {});
        const duplicates = [];
        for (const id of allPids) {
            if (pidCounts[id] >= 2 && !duplicates.includes(id)) {
                duplicates.push(id);
            }
        }
        const groupIndexByProduct = getOrInitGroupIndexForProduct(record, ctx, duplicates);
        const productGroupIndex = groupIndexByProduct.get(pid);
        if (!productGroupIndex) return cls;

        const colorGroupCount = this.dlcColorGroupCount || getScssFallbackColorGroupCount();
        return `${cls} o_dlc_row o_dlc_group_${((productGroupIndex - 1) % colorGroupCount) + 1}`.trim();
    }
});
