# Screen Spec: [Screen Name]

**Screen ID:** SCR-XX-XX
**Route:** `/path/to/screen`
**Role:** Admin | Tutor | Student
**Status:** DRAFT | REVIEW | APPROVED

---

## 1. Overview

### 1.1 Purpose
[What is this screen used for? Who uses it?]

### 1.2 Entry Points
- From which screen can the user access this?
- Which Link/Button triggers navigation?

### 1.3 Exit Points
- Where can the user go from this screen?

---

## 2. UI Components

### 2.1 Header/Toolbar
| Component | Type | Behavior |
|-----------|------|----------|
| Title | Text | Static: "[Screen Title]" |
| Add Button | Button | Click → Open modal |

### 2.2 Main Content

#### Filters (if any)
| Field | Type | Options | Default |
|-------|------|---------|---------|
| Status | Dropdown | Active, Inactive | All |
| Date Range | Date Picker | - | Last 30 days |

#### Data Table (if any)
| Column | Data Field | Sortable? | Width |
|--------|------------|-----------|-------|
| Name | `user.name` | Yes | 200px |
| Email | `user.email` | No | auto |
| Actions | - | No | 100px |

### 2.3 Modals/Drawers
| Modal Name | Trigger | Purpose |
|------------|---------|---------|
| Create Modal | Click "Add" | Form for creation |
| Detail Drawer | Click row | View details |

---

## 3. Functional Requirements

| ID | UI Element | User Action | System Response | Logic Note |
|----|------------|-------------|-----------------|------------|
| FR-01 | Search Input | Type text | Filter results | Debounce 500ms |
| FR-02 | Add Button | Click | Open Create Modal | Check permission |
| FR-03 | Save Button | Click | Validate & Submit | Show loading state |

---

## 4. Validation Rules

| Field | Type | Mandatory | Validation | Error Message |
|-------|------|-----------|------------|---------------|
| email | string | Yes | Valid email format | "Invalid email" |
| phone | string | No | 10 digits | "Phone number must be 10 digits" |

---

## 5. Data Fields Reference

> [!TIP] This section helps Devs know where to fetch data from, avoiding the need to ask BAs repeatedly.

| UI Field | API Field | Source Endpoint | Notes |
|----------|-----------|-----------------|-------|
| Student Name | `user.name` | GET /users | Concat first + last name |
| Email | `user.email` | GET /users | - |
| Class Name | `class.name` | GET /classes | - |
| Enrollment Date | `enrollment.created_at` | GET /enrollments | Format: DD/MM/YYYY |
| Status | `enrollment.status` | GET /enrollments | Enum: PENDING, ACTIVE, COMPLETED |

---

## 6. API Calls

### 5.1 Fetch Data
```yaml
GET /api/v1/resource
Query Params:
  page: integer (default: 1)
  limit: integer (default: 20)
  status: string (optional)
  search: string (optional)
Response:
  data: array
  total: integer
  page: integer
```

### 5.2 Create/Update
```yaml
POST /api/v1/resource
Request Body:
  field1: type
  field2: type
Response:
  id: string
  ...
```

---

## 7. States

### 6.1 Loading State
- Skeleton loader or spinner
- Disable all interactions

### 6.2 Empty State
- Message: "No data available"
- CTA: "Add new" button

### 6.3 Error State
- Error message from API
- Retry button

---

## 8. Responsive Behavior

| Breakpoint | Layout Changes |
|------------|----------------|
| Mobile (< 768px) | Table → Card view |
| Tablet (768-1024px) | Hide secondary columns |
| Desktop (> 1024px) | Full layout |

---

## 9. Mockup Reference

![Screen Mockup](./images/screen-name.png)
*Or Figma link: [URL]*