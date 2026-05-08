# E365 ERP TallyPrime Integration

## Architecture

The cloud ERP never calls the office Tally machine directly. The ERP creates sync jobs in the cloud. A local Windows/LAN Tally Connector runs beside TallyPrime, polls the cloud over outbound HTTPS, transforms jobs into Tally XML, and posts XML to the local Tally HTTP endpoint.

Primary write path: TallyPrime XML over HTTP.

Fallback path: local connector writes Tally-compatible XML files into `exports/pending/` for manual import.

Optional read path: ODBC is read-only and disabled by default.

## Backend setup

The backend exposes:

- `POST /api/integrations/tally/connectors/register`
- `POST /api/integrations/tally/connectors/heartbeat`
- `GET /api/integrations/tally/jobs/pending`
- `POST /api/integrations/tally/jobs/{job_id}/claim`
- `POST /api/integrations/tally/jobs/{job_id}/result`
- `POST /api/accounts/{invoice_id}/push-to-tally`
- `POST /api/accounts/{invoice_id}/resync-tally`
- `GET /api/accounts/{invoice_id}/tally-status`
- `GET /api/accounts/{invoice_id}/tally-history`

Register a connector from an admin/accounts user. Store the returned token only on the local connector machine.

## Local connector setup

Copy `tally_connector/.env.example` to `.env` or set environment variables:

```bash
ERP_BASE_URL=https://your-cloud-erp.example.com
CONNECTOR_TOKEN=paste-token-from-erp-registration
TALLY_HOST=127.0.0.1
TALLY_PORT=9000
TALLY_COMPANY_NAME=E365 PRODUCTIONS AND SERVICES LLP
TALLY_MODE=hybrid
TALLY_EXPORT_FOLDER=exports
```

Run:

```bash
python -m tally_connector.main
```

## TallyPrime configuration

Enable TallyPrime HTTP XML integration on the local Tally machine and confirm the host/port. The default connector target is `http://127.0.0.1:9000`.

## Testing without Tally

Run:

```bash
python mock_tally_server.py
```

Then run the connector in `live_http` or `hybrid` mode.

## Fallback file import

Set `TALLY_MODE=file_import` or use `hybrid` while Tally is unreachable. The connector writes deterministic XML files:

```text
exports/pending/invoice_INV-00001_12.xml
exports/pending/receipt_INV-00001_13.xml
```

After manual import, confirm through:

```text
POST /api/integrations/tally/import-confirmation
```

## Mapping seed examples

Default mappings are created automatically:

- Sales voucher type: `Sales`
- Receipt voucher type: `Receipt`
- Sales ledger: `Sales`
- Tax ledger: `Output GST`
- Receipt ledger: `Bank`
- Round off ledger: `Round Off`

Add client ledger mappings from the Accounts/Tally mappings API before strict production use.

## Open items

- ODBC reads are stubbed and intentionally disabled until a DSN is configured.
- Ledger auto-creation XML builder exists, but the connector currently does not auto-create ledgers unless that policy is added.
- Tally response parsing is conservative; production deployments should test against the actual company configuration and voucher numbering rules.
