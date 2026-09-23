# Campus Timetable Intelligence

University timetable planning and scheduling platform built with Next.js, React, TypeScript, Tailwind CSS and Recharts.

The application opens directly into a complete pilot workspace with Birmingham and Manchester reference data. It is designed to look and behave like an operational product while remaining intentionally limited to a small number of test users and a modest dataset.

## GitHub Pages

The repository includes a GitHub Actions workflow that statically exports the application and deploys it to:

`https://goreadyconsulting.github.io/campus-timetable-intelligence/`

In **Settings → Pages**, select **GitHub Actions** as the deployment source.

## Guide-aligned workflow

The platform follows this process:

1. Maintain source data for campuses, rooms, lecturers, student groups, modules and scheduling requirements.
2. Review Activity Templates containing teaching weeks, duration, planned size, tutor suitability and room suitability.
3. Record normal availability and date-specific exceptions.
4. Validate the teaching requirements before scheduling.
5. Generate, move and manually add timetable sessions.
6. Recalculate room, lecturer, student-group and capacity conflicts.
7. Review publication readiness and record a publication snapshot.
8. Export operational reports.
9. Submit pilot feedback into the shared Google Sheet.

The interface deliberately remains modern and guided rather than copying the legacy Scientia Enterprise and Classic screens.

## Reference data

The included reference dataset contains:

- 28 locations
- 16 staff
- 16 individual student pilot records
- 10 campus-specific Programmes of Study
- 40 modules
- 40 scheduling requirements
- 56 scheduled sessions
- Birmingham and Manchester campuses
- PGDL, BPC, SQE1, LLB and LLM programmes

Artificial conflict records have been removed. Conflicts are created only when current timetable data produces a genuine clash or capacity issue.

## Main areas

- Dashboard
- Activity Planning and pre-scheduling validation
- Availability and date-specific exceptions
- Data Import and staging
- Multi-week Timetable
- Room Booking
- Lecturer and Student Schedule views
- Conflict Alerts
- Review & Publication
- Analytics
- Reports
- Suggestions
- AI Help Assistant

## Shared backend

The frontend is connected to Google Apps Script and Google Sheets through `public/runtime-config.json`.

The prepared spreadsheet contains:

- Summary
- Config
- Rooms
- Lecturers
- StudentGroups
- Modules
- Requirements
- Sessions
- Conflicts
- ActivityTemplates
- AvailabilityExceptions
- PublicationLog
- Suggestions
- AuditLog
- FAQs

The Apps Script files are in `apps-script/`. Follow `apps-script/SETUP.md` whenever the backend code is updated.

Gemini keys must only be stored in Apps Script **Script Properties** and must never be committed to GitHub.

## Pilot limitation

This is a final working model for evaluation, not a scaled production service. It has no user authentication, role-based permissions, institutional calendar delivery, high-volume optimisation or multi-tenant data separation. Use approved dummy or training data and avoid sensitive live information.

## Local development

```powershell
npm.cmd install
npm.cmd run dev -- --webpack
```

Open `http://localhost:3000`.

## Production build

```powershell
npm.cmd run build
```

The static export is written to `out` and includes the GitHub Pages `index.html`.
