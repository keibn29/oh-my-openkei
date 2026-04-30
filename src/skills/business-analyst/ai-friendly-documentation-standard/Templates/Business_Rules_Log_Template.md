# Business Rules Log

**Last Updated:** YYYY-MM-DD
**Maintainer:** [BA Name]

---

## How to Use This Document

1. Each rule has a unique ID: `BR-[MODULE]-[NUMBER]`
2. Rules are written in **IF-THEN format** for AI interpretability
3. Link to PRD/Screen Spec where the rule originated
4. Update status when rules change

---

## Enrollment Module (ENR)

| Rule ID | Condition (IF) | Action (THEN) | Error/Output | Source | Status | Priority |
|---------|----------------|---------------|--------------|--------|--------|----------|
| BR-ENR-01 | `class.current_students` >= `class.max_capacity` | Block enrollment | Error: CLASS_FULL | PRD-ENR-01 | Active | HIGH |
| BR-ENR-02 | `enrollment` exists for `user_id` + `class_id` | Block duplicate | Error: ALREADY_ENROLLED | PRD-ENR-01 | Active | HIGH |
| BR-ENR-03 | `payment_status` changes to PAID | Trigger: Send confirmation email | Email sent | PRD-ENR-02 | Active | MEDIUM |
| BR-ENR-04 | `class.status` = COMPLETED | Block new enrollments | Error: CLASS_ENDED | PRD-ENR-01 | Active | HIGH |
| BR-ENR-05 | User role != STUDENT | Block enrollment | Error: INVALID_ROLE | PRD-ENR-01 | Active | MEDIUM |

---

## Class Management Module (CLS)

| Rule ID | Condition (IF) | Action (THEN) | Error/Output | Source | Status | Priority |
|---------|----------------|---------------|--------------|--------|--------|----------|
| BR-CLS-01 | `session.start_time` - now < 15 minutes | Enable "Join" button | N/A | PRD-LIVE-01 | Active | HIGH |
| BR-CLS-02 | `session.start_time` - now > 15 minutes | Disable "Join" button | N/A | PRD-LIVE-01 | Active | HIGH |
| BR-CLS-03 | Teacher reschedule count >= 2 | Block reschedule | Error: RESCHEDULE_LIMIT | PRD-CLS-02 | Active | MEDIUM |
| BR-CLS-04 | `class.current_students` > 0 | Block class deletion | Error: HAS_STUDENTS | PRD-CLS-01 | Active | HIGH |

---

## Payment Module (PAY)

| Rule ID | Condition (IF) | Action (THEN) | Error/Output | Source | Status | Priority |
|---------|----------------|---------------|--------------|--------|--------|----------|
| BR-PAY-01 | Payment amount <= 0 | Block transaction | Error: INVALID_AMOUNT | PRD-PAY-01 | Active | HIGH |
| BR-PAY-02 | Payment timeout > 30 mins | Invalidate transaction | Error: TIMEOUT | PRD-PAY-01 | Active | MEDIUM |
| BR-PAY-03 | Refund requested AND `class.start_time` - now < 24h | Require admin approval | Pending approval | PRD-PAY-02 | Active | LOW |

---

## Attendance Module (ATT)

| Rule ID | Condition (IF) | Action (THEN) | Error/Output | Source | Status | Priority |
|---------|----------------|---------------|--------------|--------|--------|----------|
| BR-ATT-01 | User clicks "Join Class" | Set attendance = PRESENT | N/A | PRD-ATT-01 | Active | HIGH |
| BR-ATT-02 | User not in `class.enrolled_students` | Block join | Error: NOT_ENROLLED | PRD-ATT-01 | Active | HIGH |
| BR-ATT-03 | `session.end_time` passed AND no attendance record | Set attendance = ABSENT | N/A | PRD-ATT-01 | Active | MEDIUM |

---

## Subscription Module (SUB)

| Rule ID | Condition (IF) | Action (THEN) | Error/Output | Source | Status | Priority |
|---------|----------------|---------------|--------------|--------|--------|----------|
| BR-SUB-01 | `subscription.end_date` < now | Set status = EXPIRED | N/A | PRD-SUB-01 | Active | HIGH |
| BR-SUB-02 | User plan = FREE AND feature requires PREMIUM | Block access | Error: UPGRADE_REQUIRED | PRD-SUB-01 | Active | HIGH |
| BR-SUB-03 | Subscription cancelled AND `end_date` not reached | Keep access until end_date | N/A | PRD-SUB-02 | Active | LOW |

---

## Template for New Rules

```markdown
| BR-[MODULE]-[NUM] | [Condition in code-friendly format] | [Action] | [Error code / Output] | [PRD reference] | Active/Deprecated | HIGH/MEDIUM/LOW |
```

---

## Change Log

| Date | Rule ID | Change | Author |
|------|---------|--------|--------|
| YYYY-MM-DD | BR-XX-XX | Created | |