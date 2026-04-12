{
    "name": "Products Line Color",
    "summary": "Highlight duplicate product lines with configurable document scope",
    "description": """
Line Color improves readability in list views by automatically coloring duplicate product lines.

Main features:
- Detect duplicate product lines and group them with consistent colors.
- Configure a custom color palette from backend settings.
- Control where coloring is applied: Sales, Purchases, Invoices, and Picking operations.
- Works in modern Odoo web client list views.
""",
    "version": "17.0.1.0.0",
    "category": "Settings/Technical",
    "author": "Optin Solutions",
    "maintainer": "optindev",
    "website": "https://www.optinsolutions.com",
    "support": "optinassist@gmail.com",
    "price": 9.5,
    "currency": "USD",
    "license": "LGPL-3",
    "depends": ["base"],
    "data": [
        "security/ir.model.access.csv",
        "data/line_color_data.xml",
        "data/line_color_config_data.xml",
        "views/line_color_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "line_color/static/src/scss/line_color.scss",
            "line_color/static/src/js/line_color.js",
        ],
    },
    "images": ["static/description/banner.png"],
    "installable": True,
    "application": False,
    "auto_install": False,
}
