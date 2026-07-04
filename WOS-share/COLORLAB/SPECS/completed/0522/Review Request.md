```
eview this spec as production infrastructure, not brainstorming.Focus on:- architectural clarity- system boundaries- scalability risk- data ownership- future technical debt- implementation feasibility- separation of concernsIdentify:- ambiguous responsibilities- hidden coupling- premature complexity- missing constraints- areas likely to break at scaleAvoid:- speculative feature expansion- UI redesign suggestions- unrelated future systemsGoal:strengthen implementation direction while preserving modularity.
```

---

# 2. Runtime/Systems Review

(best for WOS integration specs)

```
Review this spec as runtime systems architecture.Focus on:- runtime ownership- state management- data flow- determinism- update lifecycle- renderer/runtime separation- scalability under realtime conditionsIdentify:- unclear authority boundaries- hidden state duplication- systems that may drift out of sync- rendering systems incorrectly controlling truthGoal:ensure stable long-term runtime architecture.
```

---

# 3. Creative Tooling Review

(best for Colorlab editor systems)

```
Review this spec as creative tooling infrastructure.Focus on:- workflow clarity- usability under long sessions- scalability of the editing model- non-destructive editing safety- metadata architecture- archive longevity- cognitive loadIdentify:- unnecessary complexity- destructive workflows- UX bottlenecks- organizational weaknesses- future maintenance risksAvoid:- aesthetic redesign suggestions- speculative AI featuresGoal:improve long-term usability and creative sustainability.
```

---

# 4. Governance Review

(best for your strongest spec reviews so far)

```
Review this spec as infrastructure governance.Focus on:- authority boundaries- terminology stability- ownership clarity- modularity- future migration risk- continuity consistencyIdentify:- ambiguous definitions- systems that overlap responsibility- hidden implementation assumptions- sections that should split into separate specsGoal:strengthen governance and long-term maintainability.
```

---

# 5. Minimal Lightweight Version

(best for quick feedback)

```
Looking for structural feedback on this spec.Focus on:- unclear architecture- hidden technical debt- scalability concerns- implementation ambiguityNot looking for:- feature brainstorming- UI redesign- speculative expansionGoal:improve clarity and implementation direction.
```

---

# My Strong Recommendation

For Colorlab specifically:

Use this repeatedly:

```
Review this spec as creative tooling infrastructure, not feature brainstorming.Focus on:- workflow clarity- non-destructive editing- metadata scalability- long-term archive usability- modular architecture- future technical debtIdentify:- ambiguous ownership- destructive workflows- unnecessary complexity- organizational weaknesses- implementation risksAvoid:- speculative feature expansion- aesthetic redesign suggestions- unrelated future systemsGoal:strengthen long-term usability, maintainability, and atmospheric workflow design.
```

Because Colorlab’s biggest risks are:

- becoming bloated
- becoming over-engineered
- losing clarity
- collapsing under metadata complexity
- becoming “another design tool”

This review framing helps prevent that.