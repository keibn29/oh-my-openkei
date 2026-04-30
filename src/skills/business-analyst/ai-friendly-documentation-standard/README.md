# AI-Friendly Documentation Standard

**Version:** 1.0
**Created:** 2026-03-24
**Purpose:** A standardized project documentation set for the AI era - comprehensible to AI, yet easily reviewable by humans.

---

## 🎯 Objectives

1. **AI-First:** Documentation must be structured enough for AI to read and generate code.
2. **Human-Readable:** Humans (BAs, PMs, Devs) can review and maintain it.
3. **No Missed Requirements:** BAs don't miss requirements when working with clients.
4. **Adaptable:** Easy to update when requirements change.

---

## 📁 Standard Folder Structure

### ⚠️ Separation: BA Repo vs Dev Repo

**Reason:** 
- Dev-related docs (API, Database) change frequently with the code.
- Keeping them in the BA repo makes them outdated quickly.
- Dev repo = close to code = easy to maintain.

---

### BA Repo (Documentation Repo) - Capture "WHAT"

```
docs/
│
├── 00_Overview/                    # Project overview
│   ├── 00_Vision_and_Scope.md      # Vision, goals, scope
│   ├── 01_Project_Context.md       # Context, stakeholders, constraints
│   └── Glossary.md                 # Specialized terminology
│
├── 01_Business/                    # Business requirements
│   ├── User_Personas.md            # User personas
│   └── Business_Rules_Log.md       # ⭐ Centralized Business Rules
│
├── 02_Product/                     # Product requirements (Feature-level)
│   ├── features/                   # One file per feature
│   │   ├── FR-A-01_User_Management.md
│   │   ├── FR-B-01_Course_Management.md
│   │   └── ...
│   └── Acceptance_Criteria.md      # Consolidated AC
│
├── 03_Design/                      # UX/UI design
│   ├── User_Flows/                 # User flows
│   │   ├── Flow_Login.md
│   │   └── Flow_Enrollment.md
│   ├── Screen_Specs/               # Screen specifications
│   │   ├── Screen_Admin_Dashboard.md
│   │   └── Screen_Tutor_ClassList.md
│   └── Wireframes/                 # Figma links/images
│
├── System/                         # Complex system logic (business logic)
│   └── Logic_Module_X.md
│
└── Templates/                      # Reusable templates
    ├── PRD_Template.md
    ├── User_Flow_Template.md
    └── Screen_Spec_Template.md
```

---

### Dev Repo (Codebase) - Capture "HOW"

👉 **For details and guidelines on the Dev Repo structure, see: [Dev Documentation Guide](./Dev_Repo_Templates/README.md)**

---

### Flow Between Repos

```
BA Repo                    Dev Repo
   │                          │
   │  PRD + Screen Spec       │
   │ ────────────────────────>│
   │                          │ → Database Schema
   │                          │ → API Contracts
   │                          │ → Implementation Plan
   │                          │
   │  Business Rules Log      │
   │ ────────────────────────>│ → State Machines
   │                          │ → Validation Logic
   │                          │
   │                          │ Code + Tests
   │ <────────────────────────│
   │                          │
   │  Acceptance Criteria     │
   │ <────────────────────────│ QA Validation
```

---

## 📋 Required Documents

### BA Repo Documents (Product & Business)

| Document | Purpose | AI Input |
|----------|----------|----------|
| **Vision & Scope** | Direction, goals, in/out scope | Understand "why" to prioritize |
| **Glossary** | Term definitions | Consistent terminology |
| **User Personas** | User portraits | Understand user context |
| **Business Rules Log** | ⭐ Business rules (IF-THEN) | Generate if-else logic |
| **PRD / Feature Specs** | What to build | User stories, acceptance criteria |
| **User Flows** | Screens the user goes through | Generate routing, navigation |
| **Screen Specs** | UI elements, validation rules | Generate forms, tables |

### Dev Repo Documents (Technical Implementation)

👉 **For details, see: [Dev Documentation Guide](./Dev_Repo_Templates/README.md#required-documents-technical-implementation)**

### ⚠️ Important Rules

**Business Rules Log** is the bridge between the 2 repos:
- Resides in the BA repo (business owner)
- Devs copy rules to implement in code
- Rules are formatted as IF-THEN for AI parsing → auto-generate validation code

---

## 🔧 Formatting Rules

### Rule 1: Business Rules Must Be IF-THEN Tables

```markdown
| Rule ID | Condition (IF) | Action (THEN) | Error/Output |
|---------|----------------|---------------|--------------|
| BR-ENR-01 | `class.current_students` >= `class.max_capacity` | Block enrollment | Error: CLASS_FULL |
| BR-ENR-02 | `user` already enrolled in `class` | Block duplicate | Error: ALREADY_ENROLLED |
| BR-ENR-03 | `payment_status` == PAID | Send confirmation email | Async job |
```

👉 **Rules for Devs (API Contracts, Database Schema, State Machine) can be found at: [Dev Documentation Guide](./Dev_Repo_Templates/README.md#formatting-rules)**

### Rule 2: Validation Rules Must Be Tables

```markdown
| Field | Type | Mandatory | Validation | Error Message |
|-------|------|-----------|------------|---------------|
| email | string | Yes | Valid email format, unique | "Email invalid" / "Email exists" |
| max_capacity | integer | Yes | >= 1, <= 100 | "Capacity must be 1-100" |
| start_time | datetime | Yes | Must be future | "Start time must be in future" |
```

---

## ✅ BA Checklist - No Missed Requirements

### Discovery Phase
- [ ] Identified all stakeholders?
- [ ] Understood business objectives and linked to Vision?
- [ ] Analyzed current system (if any)?
- [ ] Defined User Personas?

### Requirements Definition
- [ ] Each User Story has Acceptance Criteria?
- [ ] All Business Rules captured in `Business_Rules_Log.md`?
- [ ] Considered Edge Cases and Error Handling?
- [ ] Defined Data Requirements (inputs, outputs)?
- [ ] Are Validation Rules complete?

### Documentation Quality
- [ ] Business Rules in IF-THEN table format?
- [ ] API Contracts in OpenAPI format?
- [ ] Diagrams using Mermaid?
- [ ] Glossary updated with new terms?

### Review Gate
- [ ] Reviewed with Stakeholders?
- [ ] Traceability: Business need → Feature → Requirement → Test case?

---

## 📝 Templates

### BA Repo Templates
- [PRD Template](./Templates/PRD_Template.md) - Feature specification
- [PRD Example (Filled)](./Templates/PRD_Example_Manual_Enrollment.md) - ⭐ Pre-filled example
- [User Flow Template](./Templates/User_Flow_Template.md) - User flows
- [Screen Spec Template](./Templates/Screen_Spec_Template.md) - Screen specifications
- [Business Rules Log Template](./Templates/Business_Rules_Log_Template.md) - Centralized rules
- [Glossary Template](./Templates/Glossary_Template.md) - Specialized terminology

### Dev Repo Templates
👉 **See the list of templates at: [Dev Documentation Guide](./Dev_Repo_Templates/README.md#templates)**

---

## 🔄 Workflow Process

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: Discovery & BA Documentation                          │
│  ─────────────────────────────────────────                      │
│  Stakeholder Meeting → User Stories → PRD → User Flows          │
│  ↓                                                              │
│  Business Rules Log (IF-THEN tables)                            │
│  ↓                                                              │
│  Screen Specs (UI elements, validation tables)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: Technical Documentation (Senior/Manager)              │
│  ─────────────────────────────────────────                      │
│  PRD + Screen Spec → Database Schema (Mermaid ERD)              │
│  ↓                                                              │
│  API Contracts (OpenAPI format)                                 │
│  ↓                                                              │
│  State Machines (if entity has multiple states)                 │
│  ↓                                                              │
│  Implementation Plan (Task Breakdown)                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: Implementation (Junior + AI)                          │
│  ─────────────────────────────────────────                      │
│  Copy each Task → Prompt AI → Review code                       │
│  Unit Test → PR → Code Review                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Common Pitfalls (To Avoid)

| Issue | Consequence | Solution |
|--------|---------|-----------|
| Business Rules written in prose | AI cannot parse logic | Use IF-THEN table |
| Missing Error Handling Spec | Devs have to guess error messages | Define in API Contract |
| Not specifying Timezone | Scheduling bugs, incorrect notifications | Always use UTC, convert in UI |
| Missing Race Condition handling | Double booking, data corruption | Explicit in BR |
| Missing Side Effects documentation | Forgot to send email, forgot to cleanup | Add to Implementation Plan |

---
