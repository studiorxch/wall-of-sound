Steps
1. Claude completes spec.
2. Claude writes completion report to Google Drive.
3. Updated touched files are synced to Google Drive.
4. You tell me: “Read latest PLAY completion report.”
5. I review the report, summarize status, identify risks, and draft the next spec.
---

“Spec 0619A complete. Read the report and source state.”

---
# Recommended folder structure
PLAY/  
├── CURRENT/  
│ ├── PLAY_CURRENT_STATUS.md  
│ ├── PLAY_NEXT_ACTIONS.md  
│ └── PLAY_SOURCE_INDEX.md  
├── _spec/  
│ ├── 0619A_PLAY_PlaylistWorkspaceLayout_v1.0.0_PATCH.md  
│ └── 0619B_...  
├── REPORTS/  
│ └── 2026-06-19_PLAY_0619A_PlaylistWorkspaceLayout_COMPLETION_REPORT.md  
├── SOURCE/  
│ ├── App.tsx  
│ ├── LeftDrawer.tsx  
│ ├── TopBar.tsx  
│ └── ...  
└── SCREENSHOTS/