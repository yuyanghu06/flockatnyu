# Table labels long caption finding

- Local timestamp / acting role / milestone: 2026-10-17T16:38:02.012944-04:00; evaluator; map-presence-labels.
- Requested scope: independent label UI review.
- Starting state: tablelabelimplementation ready; badgewidth can exceed48/58px marker spacing.
- Work performed: reviewer identified potential long neighboringcaption overlap; requested boundedCSSfix/test, no edits.
- Checks/evidence: source inspection and independently25SQL/API PASS. Data/authorization safe; displaywidth needed refinement.
- Decisions: retain exact labeltext/fulltooltip but cap badge width belowmarker spacing.
- Resulting state: focused layoutfix required; broad source behavior accepted.
- Handoff: frontendowner narrowbadge, testerverifyfiveadjacentlonglabels.
