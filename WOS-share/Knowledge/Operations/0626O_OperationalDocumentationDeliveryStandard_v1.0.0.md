---
layout: operational

title: "Operational Documentation Delivery Standard"
date: 2026-06-26
doc_id: "0626O_OperationalDocumentationDeliveryStandard_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "operations"
type: "governance-spec"
status: "approved"

priority: "high"
risk: "low"
classification: "documentation-governance"
---

# Purpose

This operational standard defines how archival documentation is delivered within the WOS ecosystem.

It exists to eliminate recurring uncertainty over whether implementation guidance, governance decisions, patches, reviews, or operational procedures should remain as chat responses or become permanent documentation.

# Operational Rule

**Anything intended to become part of the long-term WOS record SHALL be delivered as a downloadable Markdown (`.md`) document.**

Chat responses are considered conversational.

Markdown documents are considered archival artifacts.

# Operational Folder

Operational documents belong within the `Operational/` folder.

This folder is organized by topic rather than chronology so that related operational decisions remain easy to locate, review, and revise.

Example categories include:

- Documentation Standards
- Delivery Standards
- Review Procedures
- Naming Conventions
- Patch Workflow
- AI Collaboration
- Repository Operations

Topics may evolve over time, but each operational document should have one clearly defined purpose.

# Naming Convention

Operational documents follow the same naming philosophy as canonical specifications and patches.

Example:

```
0626O_OperationalDocumentationDeliveryStandard_v1.0.0.md
```

The filename should clearly communicate:

- creation date
- document family
- descriptive title
- semantic version

This keeps operational guidance consistent with existing specification naming conventions. The attached patch example demonstrates this style of versioned archival documentation. fileciteturn1file0L1-L40

# Delivery Policy

The following document types should always be produced as downloadable Markdown files:

- Constitutions
- Governance specifications
- Canonical specifications
- Operational standards
- Architecture reviews
- Constitutional reviews
- Production decisions
- Approved implementation plans
- Patch specifications intended for archival

Conversational explanations, brainstorming, and exploratory discussions do not require archival documents unless explicitly promoted to an operational record.

# Rationale

Using downloadable Markdown provides:

- consistent archival history
- version control compatibility
- searchable documentation
- easier maintenance
- clean repository organization

It also prevents important architectural decisions from remaining buried inside conversation history.

# Amendment Policy

This operational standard may be revised when documentation workflow changes.

Routine discussions do not modify this standard.

Only an updated, versioned operational document supersedes this one.

# Summary

Operational guidance should be easy to scan, easy to update, and easy to archive.

When a document represents lasting guidance rather than temporary conversation, its canonical delivery format is a downloadable Markdown file.
