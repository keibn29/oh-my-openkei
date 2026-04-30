# Glossary

**Last Updated:** YYYY-MM-DD
**Maintainer:** [BA Name]

---

## Purpose

This document defines the specialized terminology used in the project. Everyone in the team (BA, Dev, QA, Stakeholders) must use consistent terminology to avoid misunderstandings.

---

## Business Terms

| Term | Definition | Example | Vietnamese |
|------|------------|---------|------------|
| **Enrollment** | The process of registering a student into a class | "Student enrolled in TOPIK I class" | Đăng ký học |
| **Class** | A specific course offering with a schedule and a teacher | "Beginner A - Mon/Wed 19:00" | Lớp học |
| **Course** | Complete curriculum or study program | "TOPIK I Preparation Course" | Khóa học |
| **Session** | A specific class meeting in the schedule | "Session 5: Grammar Practice" | Buổi học |
| **Syllabus** | Detailed teaching plan | "Syllabus for 12-week course" | Giáo trình |
| **Lead** | A potential customer who has not yet converted | "Lead from website registration" | Khách hàng tiềm năng |

---

## User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **Admin** | System Administrator | Full access to all features |
| **Tutor** | Teacher / Instructor | Manage assigned classes, grade homework |
| **Student** | Learner | Join classes, submit homework, take tests |
| **Staff** | Support Staff | Limited admin access |

---

## Status Enums

### Enrollment Status
| Status | Description |
|--------|-------------|
| `PENDING` | Pending payment |
| `ACTIVE` | Currently studying |
| `COMPLETED` | Completed |
| `CANCELLED` | Cancelled |
| `REFUNDED` | Refunded |

### Payment Status
| Status | Description |
|--------|-------------|
| `PENDING` | Pending payment |
| `PAID` | Paid |
| `FAILED` | Payment failed |
| `REFUNDED` | Refunded |

### Session Status
| Status | Description |
|--------|-------------|
| `SCHEDULED` | Scheduled |
| `IN_PROGRESS` | In progress |
| `COMPLETED` | Finished |
| `CANCELLED` | Cancelled |

---

## Technical Terms

| Term | Definition |
|------|------------|
| **API** | Application Programming Interface |
| **CRUD** | Create, Read, Update, Delete - Basic data operations |
| **UUID** | Universally Unique Identifier |
| **JWT** | JSON Web Token - Standard for authentication tokens |
| **Pagination** | Structuring data in pages |
| **Debounce** | Delaying action execution until the user stops typing |

---

## Acronyms

| Acronym | Full Form | Vietnamese |
|---------|-----------|------------|
| **PRD** | Product Requirements Document | Tài liệu yêu cầu sản phẩm |
| **SRS** | Software Requirements Specification | Đặc tả yêu cầu phần mềm |
| **AC** | Acceptance Criteria | Tiêu chí nghiệm thu |
| **BR** | Business Rule | Quy tắc nghiệp vụ |
| **US** | User Story | Câu chuyện người dùng |
| **MVP** | Minimum Viable Product | Sản phẩm khả dụng tối thiểu |
| **TOPIK** | Test of Proficiency in Korean | Kỳ thi năng lực tiếng Hàn |

---

## Naming Conventions

### File Naming
| Type | Format | Example |
|------|--------|---------|
| PRD | `FR-X-XX_FeatureName.md` | `FR-A-01_User_Management.md` |
| Screen Spec | `Screen_ModuleName.md` | `Screen_StudentList.md` |
| User Flow | `Flow_FeatureName.md` | `Flow_Enrollment.md` |
| Business Rule | `BR-[MODULE]-[NUM]` | `BR-ENR-01` |

### Database Naming
| Type | Convention | Example |
|------|------------|---------|
| Table | snake_case, plural | `users`, `enrollments` |
| Column | snake_case | `created_at`, `user_id` |
| Foreign Key | `{table}_id` | `class_id`, `user_id` |
| Index | `idx_{table}_{columns}` | `idx_enrollments_user_id` |

---

## Change Log

| Date | Term Added | Author |
|------|------------|--------|
| YYYY-MM-DD | Initial glossary | |