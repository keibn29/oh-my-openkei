# Quick Start Guide for BA

**Objective:** Guide BAs on getting started with the AI-friendly documentation standard

---

## 🔄 BA Repo vs Dev Repo

**BA Repo** = Capture **WHAT** to build
- Vision, Business Rules, User Stories, Flows, Screen Specs
- Stable, rarely changes after sign-off

**Dev Repo** = Capture **HOW** to build
- API Contracts, Database Schema, State Machines, Implementation Plans
- Changes frequently along with the code
- Located in the codebase for easy maintenance

**⚠️ Business Rules Log is the bridge:**
- Resides in the BA repo (business owner)
- Devs copy to implement validation logic
- IF-THEN format for AI parsing

---

## 🚀 4-Step Process

### Step 1: Discovery Meeting with Client

**Bring along:**
- `00_Vision_and_Scope.md` template
- `User_Personas.md` template

**Key Questions:**
1. What is the business problem?
2. Who will use the system?
3. What are the expected results?
4. Scope: What WILL be done, what WILL NOT be done?

**After the meeting:**
- Fill in `00_Vision_and_Scope.md`
- Create User Personas
- Update `Glossary.md` with new terminology

---

### Step 2: Write PRD for each Feature

**File to create:** `02_Product_Requirements/features/FR-X-XX_FeatureName.md`

**Use template:** `PRD_Template.md`

**Focus on:**
1. User Stories - Standard format:
   - "As a [user], I want [action], so that [benefit]"
2. Acceptance Criteria - Gherkin format:
   - "Given [context], When [action], Then [outcome]"
3. Business Rules - **MOST IMPORTANT** - Use IF-THEN table

**⚠️ Do not write business rules in prose!**

❌ Incorrect:
> "Students cannot enroll if the class is full."

✅ Correct:
| Condition (IF) | Action (THEN) | Error |
|----------------|---------------|-------|
| `current_students` >= `max_capacity` | Block enrollment | CLASS_FULL |

---

### Step 3: Create User Flow & Screen Specs

**User Flow:**
- File: `03_Design_Specifications/User_Flows/Flow_Name.md`
- Use Mermaid diagram
- List all decision points and error paths

**Screen Spec:**
- File: `03_Design_Specifications/Screen_Specs/Screen_Name.md`
- List all UI elements
- Validation rules in table format
- API calls

---

### Step 4: Review Checklist

Before handing over to the Dev team:

- [ ] Are all Business Rules in the PRD copied to `Business_Rules_Log.md`?
- [ ] Does each Business Rule have a Rule ID?
- [ ] Are Validation rules in table format?
- [ ] Does the User Flow have error paths?
- [ ] Is the Glossary updated?
- [ ] Have edge cases been considered?

---

## 📋 Daily BA Checklist

### When writing a User Story
- [ ] Is there an "As a... I want... So that..."?
- [ ] Are there at least 2 Acceptance Criteria?
- [ ] Are the AC in Gherkin format (Given/When/Then)?

### When writing Business Rules
- [ ] Is it an IF-THEN table format?
- [ ] Is there a Rule ID?
- [ ] Is there an Error Code/Message?
- [ ] Is there a link to the source PRD?

### When writing a Screen Spec
- [ ] Is the list of UI elements complete?
- [ ] Is there a Validation rules table?
- [ ] Error states?
- [ ] Loading states?
- [ ] Empty states?

### When writing a User Flow
- [ ] Is there a Mermaid diagram?
- [ ] Are there error paths?
- [ ] Is there a list of related Business Rules?
- [ ] Is there a list of related Screens?

---

## 🎯 Tips for AI-Friendly Docs

### DO ✅
- Use tables for rules, validation, data
- Use Mermaid for diagrams
- Use consistent terminology (according to the Glossary)
- Numbering: FR-01, BR-01, US-01
- Link files together

### DON'T ❌
- Write long prose for logic
- Use vague terms: "can", "should", "depends"
- Forget error messages
- Mix terminology (student vs learner vs user)

---

## 📁 File Naming Convention

```
PRD:           FR-X-XX_FeatureName.md
User Flow:     Flow_FeatureName.md
Screen Spec:   Screen_ModuleName.md
Business Rule: BR-[MODULE]-[NUM]
API:           api_contracts_modulename.md
```

---

## 🔗 Quick Links

- [README.md](./README.md) - Full documentation standard
- [PRD Template](./Templates/PRD_Template.md)
- [PRD Example (Filled)](./Templates/PRD_Example_Manual_Enrollment.md) ⭐ **Example filled template**
- [User Flow Template](./Templates/User_Flow_Template.md)
- [Screen Spec Template](./Templates/Screen_Spec_Template.md)
- [Business Rules Log Template](./Templates/Business_Rules_Log_Template.md)
- [Glossary Template](./Templates/Glossary_Template.md)

### Dev Repo Templates (for developers)
- [API Contracts Template](./Dev_Repo_Templates/API_Contracts_Template.md)
- [Database Schema Template](./Dev_Repo_Templates/Database_Schema_Template.md)
- [State Machine Template](./Dev_Repo_Templates/State_Machine_Template.md)
- [Implementation Plan Template](./Dev_Repo_Templates/Implementation_Plan_Template.md)