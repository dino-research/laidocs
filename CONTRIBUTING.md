# Contributing to LAIDocs

Thank you for your interest in contributing! LAIDocs is an open-source, privacy-first document manager. We welcome contributions of all kinds.

## Getting Started

### Prerequisites

- **Node.js** >= 18 (for frontend)
- **pnpm** (package manager)
- **Python** >= 3.11 (for backend)
- **Rust** + **Tauri CLI v2** (for desktop builds)

### Setup

```bash
# Clone the repo
git clone https://github.com/dino-research/laidocs.git
cd laidocs

# Setup Python backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Setup Frontend
cd ..
pnpm install

# Dev mode (starts both frontend + backend)
pnpm tauri dev
```

### Backend-Only Development

If you only want to work on the Python backend:

```bash
cd backend
python main.py --dev  # starts FastAPI on localhost:8008
```

### Frontend-Only Development

If you only want to work on the React frontend:

```bash
pnpm dev  # starts Vite on :5173 (requires backend running separately)
```

## Project Structure

```
laidocs/
├── backend/          # Python FastAPI sidecar
│   ├── api/          # REST route handlers
│   ├── core/         # Config, database, vault
│   ├── models/       # Pydantic models
│   └── services/     # Agent, converter, crawler, tree_index
├── src/              # React + TypeScript frontend
│   ├── components/   # UI components
│   ├── pages/        # Page views
│   ├── context/      # React context providers
│   ├── hooks/        # Custom hooks
│   └── lib/          # API client, utilities
├── src-tauri/        # Tauri v2 (Rust shell)
└── tests/            # Python test suite
```

## Code Style

### Python
- Follow PEP 8
- Use type hints
- Use `logging` module (no `print()` in production code)
- Async-first: use `async/await` for I/O operations

### TypeScript/React
- Use functional components with hooks
- Inline styles (project convention — Warp-inspired design system)
- Use CSS variables from `src/index.css` for consistent theming

### Git Conventions
- Use descriptive commit messages
- Keep PRs focused on a single concern
- Reference issue numbers when applicable

## Reporting Bugs

Please use the [Bug Report template](https://github.com/dino-research/laidocs/issues/new?template=bug_report.md) and include:
- OS and version
- LAIDocs version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs

## Suggesting Features

Use the [Feature Request template](https://github.com/dino-research/laidocs/issues/new?template=feature_request.md) and describe:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Questions?

Feel free to open a [Discussion](https://github.com/dino-research/laidocs/discussions) for questions, ideas, or general conversation.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
