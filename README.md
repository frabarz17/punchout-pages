# punchout-pages

PunchOut web pages for Salesforce Retail Cloud / POS deployments.

Each client has its own folder under `clients/`. Each sub-project is deployed as a separate Vercel project with its own environment variables.

## Structure

```
clients/
└── {client-slug}/
    └── {feature}/      ← Vercel root directory for this deployment
        ├── api/        Vercel serverless functions (Node.js ESM)
        ├── lib/        Shared business logic and Salesforce client
        ├── public/     Static HTML pages
        └── vercel.json
```

## Current clients

| Client | Feature | Vercel root |
|--------|---------|-------------|
| alcott | appointments | `clients/alcott/appointments` |

## Deploy a new client

1. Create `clients/{slug}/{feature}/` following the same structure
2. Add env vars on Vercel: `SF_LOGIN_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_API_VERSION`
3. Create a new Vercel project pointing to the client's root directory
