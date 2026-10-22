# Product

Myriad is a C programming exam platform for students and exam managers. Students compile and run programs in the browser; managers author and verify exams locally. Cloudflare Workers store exam bundles, submission snapshots and reported results.

Students can sign in through the deployment's enabled providers, NYCU OAuth and Google through Firebase Authentication, or use a self-declared guest identifier. Each provider is independently enabled by server configuration. Identities from different providers and guest identities have separate drafts and submissions; matching names or email addresses do not merge accounts. Managers use authenticated accounts with per-exam ownership or collaborator permissions; creating an exam requires an explicit platform grant.

The interface supports multiple concurrent exams, resumable submissions, manager previews, submission analysis and private verification reports. Browser verdicts are provisional. Managers recompile and run submitted source locally to verify results after an exam.

Student access to problems, inputs and submission summaries ends at the exam deadline. Manager reports remain private to the exam's owners and collaborators.

The Traditional Chinese interface uses a compact dark workspace: navigation, a problem list, a statement/editor split and a judge panel. Smaller screens use drawers and tabs. See [DESIGN.md](DESIGN.md) for the design system and [ARCHITECTURE.md](ARCHITECTURE.md) for implementation boundaries.
