# Development Philosophy

- **Do not reimplement the harness.** Use capabilities already provided by the active model and environment. Add only the smallest scaffold needed when a required capability is actually missing.

- **Provide only project-specific knowledge.** Focus repository instructions on this project's requirements, responsibility boundaries, constraints, generated artifacts, contribution workflow, and completion criteria.

- **Treat the repository as the interface.** Important knowledge should be discoverable from clear sources of truth, code, and tests rather than depending on conversation history or prompts.

- **Improve the environment before the prompt.** When an agent struggles, prefer better tests, types, validation, APIs, responsibility boundaries, and repository legibility over adding more instructions.

- **Make completion observable.** Completion is determined by required tests, checks, and acceptance conditions, not by statements such as “mostly done” or “temporarily complete.”

- **Give context a purpose.** Use broad repository context where reasoning and decisions are required, then give implementation agents a self-contained plan without carrying over unnecessary research history or rejected alternatives.

- **Architect context delivery.** AI-driven development succeeds on the structures built to supply just the right context—no more, no less. Establish clean modularity, indexable references, and predictable retrieval paths so agents receive exact, relevant inputs without noise.
