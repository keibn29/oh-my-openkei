# PRD: [Feature Name]

**Feature ID:** FR-X-XX
**Status:** DRAFT | REVIEW | APPROVED
**Priority:** HIGH | MEDIUM | LOW
**Author:** [Name]
**Date:** YYYY-MM-DD

---

## 1. Overview

### 1.1 Goal
- **Business Problem:** [Problem to be solved]
- **Success Metrics:** [How to measure success]

### 1.2 Scope
- **In-Scope:** [What will be done]
- **Out-Scope:** [What will NOT be done in this phase]

### 1.3 Stakeholders
| Role | Name | Responsibility |
|------|------|----------------|
| Owner | | Approve requirements |
| BA | | Document, analyze |
| Dev | | Implement |

---

## 2. User Stories

### US-01: [Story Title]
**As a** [type of user],
**I want** [an action],
**So that** [a benefit/value].

**Acceptance Criteria:**
- [ ] Given [context], When [action], Then [outcome]
- [ ] Given [context], When [action], Then [outcome]

### US-02: [Story Title]
...

---

## 3. Business Rules

> [!IMPORTANT] These rules are directly translatable to code logic.

| Rule ID | Condition (IF) | Action (THEN) | Error/Output |
|---------|----------------|---------------|--------------|
| BR-XX-01 | | | |
| BR-XX-02 | | | |
| BR-XX-03 | | | |

---

## 4. Validation Rules

| Field | Type | Mandatory | Validation | Error Message |
|-------|------|-----------|------------|---------------|
| | | Yes/No | | |
| | | Yes/No | | |

---

## 5. UI/UX Reference

- **User Flow:** [Link to `User_Flows/Flow_X.md`]
- **Screen Specs:** [Link to `Screen_Specs/Screen_X.md`]
- **Figma:** [Link]

---

## 6. Edge Cases & Error Handling

| Scenario | Expected Behavior | Error Code |
|----------|-------------------|------------|
| [Edge case 1] | | |
| [Edge case 2] | | |

---

## 7. Feature Dependencies

> [!TIP] This section helps Devs know what other features this feature depends on.

| Feature ID | Feature Name | Dependency Type | Status | Notes |
|------------|--------------|-----------------|--------|-------|
| FR-A-01 | User Management | Must complete first | Done | Required for user data |
| FR-B-02 | Payment Gateway | API available | In Progress | Need payment endpoint |
| FR-C-01 | Notification | Nice to have | Pending | Email/SMS integration |

**Dependency Types:**
- **Must complete first:** This feature must be completed before work can start
- **API available:** Needs API from another feature
- **Nice to have:** Optional but good to have

---

## 9. External Integrations

| Service/API | Purpose | Status | Documentation |
|-------------|---------|--------|---------------|
| Payment Gateway | Process payments | Ready | [Link to docs] |
| Email Service | Send notifications | Pending | [Link to docs] |
| SMS Provider | Send OTP | Not started | [Link to docs] |

---

## 10. Open Questions

- [ ] Question 1?
- [ ] Question 2?

---

## 11. Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| YYYY-MM-DD | 1.0 | Initial draft | |