"""0005 quotations

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-19

"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "quotations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.Column("quote_number", sa.String, nullable=False, unique=True),
        sa.Column("version", sa.Integer, default=1),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("project_event_id", sa.Integer, sa.ForeignKey("project_events.id"), nullable=True),
        sa.Column("converted_booking_id", sa.Integer, sa.ForeignKey("event_bookings.id"), nullable=True),
        sa.Column("status", sa.String, default="draft"),
        sa.Column("valid_until", sa.Date, nullable=True),
        sa.Column("subject", sa.String, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("terms", sa.Text, nullable=True),
        sa.Column("discount_pct", sa.Float, default=0.0),
        sa.Column("tax_pct", sa.Float, default=18.0),
        sa.Column("subtotal", sa.Float, default=0.0),
        sa.Column("discount_amount", sa.Float, default=0.0),
        sa.Column("tax_amount", sa.Float, default=0.0),
        sa.Column("total", sa.Float, default=0.0),
        sa.Column("created_by", sa.String, nullable=True),
        sa.Column("updated_by", sa.String, nullable=True),
    )
    op.create_index("ix_quotations_quote_number", "quotations", ["quote_number"])

    op.create_table(
        "quotation_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("quotation_id", sa.Integer, sa.ForeignKey("quotations.id"), nullable=False),
        sa.Column("sort_order", sa.Integer, default=0),
        sa.Column("description", sa.String, nullable=False),
        sa.Column("item_type", sa.String, default="equipment"),
        sa.Column("hsn_code", sa.String, nullable=True),
        sa.Column("qty", sa.Float, default=1.0),
        sa.Column("unit", sa.String, default="days"),
        sa.Column("rate", sa.Float, default=0.0),
        sa.Column("amount", sa.Float, default=0.0),
    )


def downgrade():
    op.drop_table("quotation_items")
    op.drop_index("ix_quotations_quote_number", table_name="quotations")
    op.drop_table("quotations")
