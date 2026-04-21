"""inventory extensions: vendor window, qty_in_stock

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("inventory_items") as batch_op:
        batch_op.add_column(sa.Column("vendor_available_from", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("vendor_available_until", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("qty_in_stock", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("inventory_items") as batch_op:
        batch_op.drop_column("qty_in_stock")
        batch_op.drop_column("vendor_available_until")
        batch_op.drop_column("vendor_available_from")
