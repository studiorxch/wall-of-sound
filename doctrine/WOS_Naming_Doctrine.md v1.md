---
Name: WOS Naming Doctrine
Version: v1.1.0
Status: Active
Last Updated: 2026-05-17

---

# Purpose

This document defines naming principles used throughout WOS.

Global System Doctrine: UI & UX Engineering Standards

This document establishes the architectural, visual, and behavioral mandates for all modules within the system. Every interface, layout, and API interaction must satisfy these four foundational pillars.

```
                  ┌─────────────────────────────────────────┐
                  │        GLOBAL SYSTEM DOCTRINE           │
                  └────────────────────┬────────────────────┘
                                       │
         ┌───────────────────┬─────────┴─────────┬───────────────────┐
         ▼                   ▼                   ▼                   ▼
    1. CLARITY        2. CONSISTENCY      3. MAINTAINABILITY   4. REDUCED CONFUSION
 (Cognitive Load)    (Behavior & UI)     (Architecture & Code)   (Mental Models)
```

---

Pillar 1: 
# Clarity 
##### (Cognitive Load & Data Density)

The application must present complex, dense data in a way that minimizes user fatigue and highlights actionable information.

- **Strict Content Hierarchy**: Design layouts using an intentional typographic scale. Key status indicators and primary actions must dominate the screen, while secondary telemetry sits lower in visual priority.
- **Context-Driven Progressive Disclosure**: Show users only the data they need to complete their current task. Use collapsible panels, drawers, and nested routes to hide advanced or secondary workflows.
- **Intentional Workspace Density**: Maintain a balanced grid layout. High-utility dashboard modules require dense, compact grids for comparison, while configuration forms require more whitespace to prevent input fatigue.
- **Scannable Status Indicators**: Never rely on text alone to convey system health. Use combined visual indicators—such as specific colors, distinct icons, and text labels—so users can scan and understand system state in under two seconds.

---

Pillar 2: 
# Consistency 
##### (Behavioral & Visual Predictability)

Predictability builds user trust and accelerates daily workflows. If a pattern works a certain way in one module, it must work identically everywhere else.

- **Design Token Governance**: Hardcode no visual values. All colors, spacing, corner radiuses, font weights, and animation durations must inherit from global, centralized design tokens.
- **Standardized Layout Anatomy**: Keep your structural global layouts fixed. Global navigation belongs in a locked position, primary action zones (like save/submit buttons) must always anchor to the same screen location, and close/cancel triggers must stay uniform.
- **Uniform Interaction States**: Every interactive component (buttons, inputs, row selections) must share identical hover, focus, active, loading, and disabled visual states across the entire application.
- **Shared Component Ecosystem**: Build complex features exclusively out of a unified, central component library. A dropdown menu, modal window, or data table must look and behave identically whether it is in a settings panel or a main dashboard.

---

Pillar 3: 
# Long-Term Maintainability 
##### (Architecture & Scalability)

The system's codebase must scale smoothly alongside business logic changes without requiring manual, fragile frontend adjustments.

```
  +──────────────────────+       +──────────────────────+       +──────────────────────+
  │   Unified API Spec   │ ───►  │ Fully Type-Safe UI   │ ───►  │ Schema-Driven Views  │
  │ (Protobuf/OpenAPI)   │       │   (TypeScript/App)   │       │ (Dynamic Dashboards) │
  +──────────────────────+       +──────────────────────+       +──────────────────────+
```

- **Schema-Driven UI Rendering**: Minimize the use of custom, hardcoded interface views. Generate data grids, search filters, and configuration forms dynamically using structured data definitions (e.g., JSON Schema, TypeScript definitions).
- **Decoupled Business Logic**: Separate data fetching, state management, and business logic completely from your presentational UI components. UI elements should serve purely as a visual skin for data states.
- **Strict Enterprise Type-Safety**: Enforce compile-time type checking from the backend API all the way down to individual interface form inputs. This prevents breaking changes from reaching production when database models change.
- **Modular Atomic Architecture**: Break complex views down into small, isolated, single-responsibility components. Each component must manage its own private state, relying on props or events for external system communication.

---

Pillar 4: 
# Reduced Semantic Confusion 
##### (Mental Models & Validation)

Eliminate the translation gap between the engineering architecture of your backend system and the operational mental model of your end user.

- **Ubiquitous Application Language**: Align system labeling exactly with the engineering vocabulary. Avoid situations where code refers to an entity as an `Agent` while the UI labels it an `Executor`. Use one shared name across code, UI, and documentation.
- **Explicit Local Quantification**: Never show a raw number without its accompanying unit of measurement. Display clear attributes (e.g., `350ms`, `24 GiB`, `Gbps`) immediately next to data fields to eliminate user guesswork.
- **Inline Guardrails & Validation**: Catch errors early. Prevent invalid data submission by utilizing real-time, inline validation patterns that clearly explain _why_ an input fails format requirements before a submit button is pressed.
- **Deterministic Action Responses**: Provide instant visual feedback for every user interaction. If a background process takes longer than 200 milliseconds, display an active loading skeleton or progress bar to confirm the system is actively working.

---

## Universal Production Addendums

To ensure this comprehensive doctrine handles real-world software scales, every feature module must satisfy these three operational constraints:

- **Performance & Data Virtualization**: Any component rendering more than 100 rows or data points (like logs, tables, or item trees) must use virtualized scrolling to maintain 60 frames per second UI performance.
- **Global Search & Filter Access**: Make complex workspace structures instantly searchable using a standardized global filter or command palette system.
- **Fault-Tolerant Workflows**: Protect users from catastrophic mistakes. Every destructive system action requires an explicit confirmation modal, and complex configuration views should offer localized draft staging with an accessible undo history.

---

Section 2: 
# Core Principles — Prefer Meaning Over Style

Code is read far more often than it is written. Naming choices must prioritize the transmission of accurate system architecture over superficial aesthetic choices, clever phrasing, or brevity.

```
       [ BAD ]                                  [ GOOD ]
"optimizePerformance()"  ──► (Vague Style)  ──► "debounceInputEvents()"
"agentMatrix"            ──► (Metaphor)     ──► "executorPool"
```

1. What Names Must Prioritize

- **Readability**: Write code that can be read aloud like simple prose. A developer unfamiliar with the module must understand what a variable holds or what a function accomplishes on their first pass.
- **Conceptual Accuracy**: Names must perfectly mirror the underlying technical mechanism or data model. If an object manages a localized data cache, its name must include `Cache`, not `Store` or `Buffer`.
- **Long-Term Clarity**: Choose explicit, self-documenting terms over brief shortcuts. A long, hyper-specific name is always superior to a short, ambiguous one.

2. What Names Must Avoid

- **Trendy Terminology**: Ban passing software industry slang. Terms like `serverlessify`, `hydration`, or `atomic_juice` introduce expiration dates into your codebase. Stick to foundational computer science nomenclature.
- **Vague Metaphors**: Eliminate poetic or abstract descriptions. Avoid naming a central event hub `TheMotherShip` or a clean-up utility `Janitor`. Use structural, objective descriptors like `EventDispatcher` or `GarbageCollector`.
- **Over-Branding Internal Systems**: Do not name internal codebase engines after marketing terms or company project code names. If a user-facing tool is called "WizardStream," the underlying code must still use standard architectural names like `DataIngestionPipeline`.
---

Section 2.3: One Meaning Per Term (The System Dictionary)

To eliminate semantic confusion and enable a fully automated, schema-driven interface, every concept must map to exactly one explicit term. Synonyms, casual speech, and overloaded terminology are strictly banned in the codebase and data schemas.

```
       [ BANNED ]                                [ MANDATED ]
"Asset" (Overloaded)      ──► (Strict Mapping) ──► "Object" (Deterministic)
"Scene" (Vague Metaphor)  ──► (Strict Mapping) ──► "World"  (System Context)
```

Rules of Interpretation

- **Zero Term Overloading**: A term must never change its meaning based on the module or context it is used in.
- **No Casual Substitutions**: Engineers must never use conversational synonyms (e.g., calling an `Entity` a "Thing" in a code comment or variable name).
- **UI-to-Code Alignment**: Interface structures must use the structural code name as their underlying architectural definition, even if a user-facing label override is applied later.
- 
---

# Mandatory Architectural Vocabulary

|Preferred System Term|Banned / Avoid|System Definition & Boundary|
|---|---|---|
|**`Entity`**|Thing, Item|A distinct, uniquely identifiable system instance with state.|
|**`Actor`**|Unit, Player|An active entity capable of executing independent behaviors.|
|**`Agent`**|AI, Bot|A specialized runtime process driven by automated intelligence models.|
|**`Object`**|Asset, Resource|A concrete data payload structural definition within a schema.|
|**`World`**|Scene, Environment|The top-level global runtime container holding all entities.|
|**`Tool`**|Mode, State|A specific interactive workspace utility active in the system cursor.|
|**`Walker`**|Brush, Cursor|The programmatic data traversal mechanism passing through nodes.|
|**`Inspector`**|Panel, Sidebar|The unified schema-driven interface view used to modify object states.|
|**`Motion Path`**|Stroke, Line|The vector data array defining physical spatial translation.|
|**`Sound Event`**|FX, Audio|A discrete acoustic trigger managed by the system event bus.|


### Note on Feature Ideation & Translation 
Initial product specs and leadership directives will naturally use conversational, conceptual, and branded language (e.g., "We need to update how the brush works on this asset"). 

It is the explicit responsibility of the engineering team during the technical design phase to map these conversational inputs to the system dictionary definitions (e.g., mapping "brush" to `Walker`, and "asset" to `Object`) before any code or database schemas are generated. The codebase must remain strictly robotic, even when ideation is human.

---

### Section 3: The Separation of Architectural and Presentation Language

To maintain a pure schema-driven UI, we enforce a strict boundary between "System Language" (code) and "Product Language" (UI Copy).

1. System Language (Code/Schemas): Must remain strictly architectural, boring, and engineering-focused (e.g., `DeltaStateReplicator`).
2. Product Language (UI/Tooltips): May use branded, casual, or creative terms (e.g., "SmartSync").

CRITICAL MANDATE:
Engineers must never introduce Product Language into code variables, database keys, or component filenames. 
If a feature requires a branded user-facing name, that name must live exclusively inside a schema `ui_display_label` string attribute. The functional codebase must remain 100% architectural.



---

# Avatar Usage

"Avatar" should only be used when:
- representing a user
- representing user embodiment
- representing social presence

Avoid using "avatar" for:
- generic entities
- environmental systems
- simulation actors
- infrastructure components

---

# Naming Tone

WOS naming should feel:
- infrastructural
- cinematic
- modular
- readable
- systemic

Avoid naming that feels:
- toy-like
- gimmicky
- overly corporate
- excessively abstract

---

# Current Direction

Current WOS naming direction emphasizes:
- world systems
- behavioral systems
- environmental simulation
- audiovisual infrastructure

Naming should reinforce:
- coherence
- worldbuilding
- readability
- cross-system compatibility