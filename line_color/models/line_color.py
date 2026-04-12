from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class LineColor(models.Model):
    _name = "line.color"
    _description = "Line Color"
    _order = "sequence, id"

    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    background_color = fields.Char(required=True, default="#dfe9ff")
    border_color = fields.Char(required=True, default="#2f5fb3")
    hover_color = fields.Char(required=True, default="#c9dbff")


class LineColorConfig(models.Model):
    _name = "line.color.config"
    _description = "Line Color Target Scope"

    name = fields.Char(required=True, default="Default Scope")
    active = fields.Boolean(default=True)

    apply_sale = fields.Boolean(string="Sales Orders", default=False)
    apply_purchase = fields.Boolean(string="Purchase Orders", default=False)
    apply_invoice = fields.Boolean(string="Invoices", default=False)

    apply_picking_outgoing = fields.Boolean(string="Delivery Orders", default=True)
    apply_picking_incoming = fields.Boolean(string="Receipts", default=False)
    apply_picking_internal = fields.Boolean(string="Internal Transfers", default=False)

    @api.constrains("active")
    def _check_single_active_config(self):
        if any(record.active for record in self):
            active_count = self.search_count([("active", "=", True)])
            if active_count > 1:
                raise ValidationError(_("Only one active Line Color Scope configuration is allowed."))
