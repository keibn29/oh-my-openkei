# API Contracts: [Module Name]

**Version:** 1.0
**Base URL:** `/api/v1/[module]`
**Last Updated:** YYYY-MM-DD

---

## Authentication

All endpoints require Bearer token unless specified otherwise.

```
Authorization: Bearer <token>
```

---

## Common Response Format

### Success
```json
{
  "data": { ... },
  "message": "Success"
}
```

### Error
```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": { ... } // Optional
}
```

---

## Endpoints

### 1. [Resource] List

```yaml
GET /api/v1/[resource]
Description: Fetch list of resources with pagination
Auth: Required (Role: ADMIN/TUTOR)

Query Parameters:
  page: integer (default: 1)
  limit: integer (default: 20, max: 100)
  search: string (optional) - Search by name/email
  status: enum (optional) - Filter by status
  sort_by: string (optional) - Field to sort
  sort_order: enum [asc, desc] (default: desc)

Response 200:
  data: array of [Resource] objects
  pagination:
    total: integer
    page: integer
    limit: integer
    total_pages: integer

Response 401:
  error: "UNAUTHORIZED"
  message: "Invalid or expired token"
```

---

### 2. [Resource] Detail

```yaml
GET /api/v1/[resource]/:id
Description: Get single resource by ID
Auth: Required

Path Parameters:
  id: string (uuid) - Resource ID

Response 200:
  id: string
  name: string
  ... (all fields)

Response 404:
  error: "NOT_FOUND"
  message: "Resource not found"
```

---

### 3. Create [Resource]

```yaml
POST /api/v1/[resource]
Description: Create new resource
Auth: Required (Role: ADMIN)

Request Body:
  field1: string (required) - Description
  field2: integer (optional) - Description
  field3: enum [VALUE1, VALUE2] (required)

Response 201:
  id: string
  ... (created object)

Response 400:
  error: "VALIDATION_ERROR"
  message: "Invalid input"
  details:
    field1: "Field1 is required"

Response 409:
  error: "DUPLICATE"
  message: "Resource already exists"
```

---

### 4. Update [Resource]

```yaml
PUT /api/v1/[resource]/:id
Description: Update existing resource
Auth: Required (Role: ADMIN)

Path Parameters:
  id: string (uuid)

Request Body:
  field1: string (optional)
  field2: integer (optional)

Response 200:
  id: string
  ... (updated object)

Response 404:
  error: "NOT_FOUND"
```

---

### 5. Delete [Resource]

```yaml
DELETE /api/v1/[resource]/:id
Description: Delete resource
Auth: Required (Role: ADMIN)

Path Parameters:
  id: string (uuid)

Response 204:
  (No content)

Response 400:
  error: "CANNOT_DELETE"
  message: "Resource has dependencies"
```

---

## Error Codes Reference

| HTTP Code | Error Code | Description |
|-----------|------------|-------------|
| 400 | VALIDATION_ERROR | Invalid input data |
| 400 | CANNOT_DELETE | Resource has dependencies |
| 401 | UNAUTHORIZED | Missing/invalid token |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 409 | DUPLICATE | Resource already exists |
| 422 | BUSINESS_RULE_VIOLATION | Business rule prevented action |
| 500 | INTERNAL_ERROR | Server error |

---

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Read (GET) | 100 requests/minute |
| Write (POST/PUT/DELETE) | 30 requests/minute |