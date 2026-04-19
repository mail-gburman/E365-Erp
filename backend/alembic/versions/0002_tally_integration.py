from alembic import op
import sqlalchemy as sa

revision = "0002_tally_integration"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tally_connectors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.String(), nullable=True),
        sa.Column("connector_name", sa.String(), nullable=False),
        sa.Column("connector_token_hash", sa.String(), nullable=False),
        sa.Column("polling_enabled", sa.Boolean(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("machine_name", sa.String(), nullable=True),
        sa.Column("tally_host", sa.String(), nullable=True),
        sa.Column("tally_port", sa.Integer(), nullable=True),
        sa.Column("company_name", sa.String(), nullable=True),
        sa.Column("import_mode", sa.String(), nullable=True),
        sa.Column("odbc_enabled", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_tally_connectors_org_id", "tally_connectors", ["org_id"])

    op.create_table(
        "tally_sync_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.String(), nullable=True),
        sa.Column("job_type", sa.String(), nullable=False),
        sa.Column("source_document_type", sa.String(), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=False),
        sa.Column("source_document_no", sa.String(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("payload_hash", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("raw_response_excerpt", sa.Text(), nullable=True),
        sa.Column("connector_id", sa.Integer(), sa.ForeignKey("tally_connectors.id"), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_tally_sync_jobs_org_id", "tally_sync_jobs", ["org_id"])
    op.create_index("ix_tally_sync_jobs_payload_hash", "tally_sync_jobs", ["payload_hash"])
    op.create_index("ix_tally_sync_jobs_status", "tally_sync_jobs", ["status"])

    op.create_table(
        "tally_mappings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.String(), nullable=True),
        sa.Column("mapping_type", sa.String(), nullable=False),
        sa.Column("erp_key", sa.String(), nullable=False),
        sa.Column("erp_label", sa.String(), nullable=True),
        sa.Column("tally_name", sa.String(), nullable=False),
        sa.Column("tally_guid_optional", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
    )
    op.create_index("ix_tally_mappings_org_id", "tally_mappings", ["org_id"])

    op.create_table(
        "tally_sync_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sync_job_id", sa.Integer(), sa.ForeignKey("tally_sync_jobs.id"), nullable=False),
        sa.Column("tally_voucher_number", sa.String(), nullable=True),
        sa.Column("tally_master_id_optional", sa.String(), nullable=True),
        sa.Column("tally_reference", sa.String(), nullable=True),
        sa.Column("sync_direction", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("normalized_message", sa.Text(), nullable=True),
        sa.Column("raw_request_path_optional", sa.String(), nullable=True),
        sa.Column("raw_response_path_optional", sa.String(), nullable=True),
        sa.Column("outstanding_amount", sa.Float(), nullable=True),
        sa.Column("payment_status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table("tally_sync_results")
    op.drop_index("ix_tally_mappings_org_id", table_name="tally_mappings")
    op.drop_table("tally_mappings")
    op.drop_index("ix_tally_sync_jobs_status", table_name="tally_sync_jobs")
    op.drop_index("ix_tally_sync_jobs_payload_hash", table_name="tally_sync_jobs")
    op.drop_index("ix_tally_sync_jobs_org_id", table_name="tally_sync_jobs")
    op.drop_table("tally_sync_jobs")
    op.drop_index("ix_tally_connectors_org_id", table_name="tally_connectors")
    op.drop_table("tally_connectors")
