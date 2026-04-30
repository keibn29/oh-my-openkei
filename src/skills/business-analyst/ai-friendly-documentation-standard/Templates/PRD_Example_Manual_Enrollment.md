# PRD: Manual Enrollment (O2O)

**Feature ID:** FR-C-01
**Status:** APPROVED
**Priority:** HIGH
**Author:** [BA Name]
**Date:** 2026-03-24

---

## 1. Overview

### 1.1 Goal
- **Business Problem:** Admins need to manually enroll students into classes when receiving cash/bank transfer payments outside the system. Currently, there is no way to track these enrollments.
- **Success Metrics:** 
  - 100% of manual enrollments are recorded in the system
  - Processing time per enrollment < 2 minutes

### 1.2 Scope
- **In-Scope:**
  - Create new enrollments for students with an existing account
  - Quick creation of new student accounts (from the enrollment form)
  - Record payments (Cash, Bank Transfer, POS)
  - Upload payment receipts
  - Price overrides (discounts)
- **Out-Scope:**
  - Automatic synchronization with accounting software
  - Payment gateway integration (separate feature)
  - Refund processing (separate feature)

### 1.3 Stakeholders
| Role | Name | Responsibility |
|------|------|----------------|
| Owner | [PM Name] | Approve requirements |
| BA | [BA Name] | Document, analyze |
| Dev Lead | [Dev Name] | Implement |
| QA | [QA Name] | Test |

---

## 2. User Stories

### US-01: Quick Student Search
**As an** Admin (Sales Staff),
**I want** to search for existing students by name, email, or phone,
**So that** I can quickly find the student to enroll without creating duplicate accounts.

**Acceptance Criteria:**
- [ ] Given I'm on the enrollment page, When I type in the search box, Then students matching name/email/phone appear in dropdown
- [ ] Given I select a student, When the student is selected, Then their info (balance, current classes) is displayed
- [ ] Given no student found, When I click "Create New", Then a mini form appears to create student quickly

### US-02: Class Selection with Availability Check
**As an** Admin,
**I want** to see available seats when selecting a class,
**So that** I don't accidentally overbook a class.

**Acceptance Criteria:**
- [ ] Given I select a class, When the class is selected, Then available seats count is shown
- [ ] Given the class is full, When I try to enroll, Then a warning appears with waitlist option
- [ ] Given the class has seats available, When I proceed, Then I can continue with enrollment

### US-03: Payment Recording
**As an** Admin (Treasurer),
**I want** to record payment method and upload receipt,
**So that** there's proof of payment for accounting purposes.

**Acceptance Criteria:**
- [ ] Given I'm filling payment info, When I select payment method, Then appropriate fields appear
- [ ] Given payment method is Bank Transfer, When I upload receipt image, Then it's stored with the enrollment
- [ ] Given I submit enrollment, When payment_status is PAID, Then confirmation email is sent to student

---

## 3. Business Rules

> [!IMPORTANT] These rules are directly translatable to code logic.

| Rule ID | Condition (IF) | Action (THEN) | Error/Output |
|---------|----------------|---------------|--------------|
| BR-MENR-01 | `class.current_students` >= `class.max_capacity` | Block enrollment | Error: CLASS_FULL |
| BR-MENR-02 | `enrollment` exists for `user_id` + `class_id` | Block duplicate | Error: ALREADY_ENROLLED |
| BR-MENR-03 | `payment_status` = PAID | Send confirmation email | Email sent |
| BR-MENR-04 | Price override > 20% discount | Require reason input | Log reason |
| BR-MENR-05 | User not found in search | Allow quick create | Create new user |
| BR-MENR-06 | Payment method = BANK_TRANSFER AND no receipt uploaded | Show warning | Allow proceed with note |

---

## 4. Validation Rules

| Field | Type | Mandatory | Validation | Error Message |
|-------|------|-----------|------------|---------------|
| student_id | UUID | Yes | Must exist in users table | "Student not found" |
| class_id | UUID | Yes | Must exist AND status = ACTIVE | "Class not found or inactive" |
| payment_status | Enum | Yes | PENDING or PAID | "Invalid payment status" |
| payment_method | Enum | Yes | CASH, BANK_TRANSFER, POS | "Invalid payment method" |
| price_override | Decimal | No | >= 0 AND <= class_price | "Price must be 0 to [class_price]" |
| receipt_file | File | Conditional | Required if BANK_TRANSFER, max 5MB, jpg/png/pdf | "Receipt required for bank transfer" |

---

## 5. UI/UX Reference

- **User Flow:** [Flow_Manual_Enrollment.md](./flows/Flow_Manual_Enrollment.md)
- **Screen Specs:** [Screen_Manual_Enrollment.md](./Screen_Manual_Enrollment.md)
- **Figma:** https://figma.com/file/xxx

---

## 6. Edge Cases & Error Handling

| Scenario | Expected Behavior | Error Code |
|----------|-------------------|------------|
| Class becomes full during enrollment process | Show error, offer waitlist option | CLASS_JUST_FILLED |
| Student account created but enrollment fails | Keep student, allow retry | ENROLLMENT_FAILED |
| Network timeout during submission | Save draft, allow resume | TIMEOUT_SAVED |
| Duplicate enrollment detected | Show existing enrollment details | ALREADY_ENROLLED |

---

## 7. Feature Dependencies

| Feature ID | Feature Name | Dependency Type | Status | Notes |
|------------|--------------|-----------------|--------|-------|
| FR-A-01 | User Management | Must complete first | Done | Required for student search/create |
| FR-B-01 | Class Management | Must complete first | Done | Required for class selection |
| FR-G-01 | Notification | API available | In Progress | For sending confirmation email |

---

## 8. External Integrations

| Service/API | Purpose | Status | Documentation |
|-------------|---------|--------|---------------|
| Email Service | Send confirmation email | Ready | [SendGrid docs] |
| File Storage | Store receipt images | Ready | [AWS S3 docs] |

---

## 9. Open Questions

- [x] Can admin create enrollment with PENDING payment status? → **Yes, for installment cases**
- [x] Should we limit price override discount percentage? → **Max 50% discount, require manager approval above 20%**
- [ ] Do we need audit log for price changes? → **TBD**

---

## 10. Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-03-24 | 1.0 | Initial draft | [BA Name] |
| 2026-03-25 | 1.1 | Added price override rules after stakeholder feedback | [BA Name] |