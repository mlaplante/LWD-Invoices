# Contributing to LWD Invoices

Thank you for your interest in contributing to LWD Invoices! This document provides guidelines and information for contributors.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
   ```bash
   git clone https://github.com/YOUR-USERNAME/LWD-Invoices.git
   cd LWD-Invoices
   ```
3. **Set up the development environment** following the instructions in the [README.md](README.md)

## Development Workflow

### 1. Create a Branch

Create a new branch for your feature or bug fix:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix-name
```

### 2. Make Your Changes

- Write clear, concise code that follows the existing code style
- Add tests for new features or bug fixes
- Update documentation as needed
- Ensure your changes don't break existing functionality

### 3. Test Your Changes

Before submitting a pull request:

```bash
# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Build the project
npm run build

# Start dev server to manually test
npm run dev
```

### 4. Commit Your Changes

We use conventional commits for clear commit history:

```bash
git commit -m "feat: add new invoice template"
git commit -m "fix: resolve payment gateway issue"
git commit -m "docs: update API documentation"
git commit -m "test: add tests for client service"
```

**Commit types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### 5. Push and Create a Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with:
- A clear title describing the change
- A detailed description of what changed and why
- Reference any related issues (e.g., "Fixes #123")
- Screenshots for UI changes

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Avoid using `any` type
- Prefer interfaces over types for object shapes

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use meaningful prop names

### Database

- Create migrations for schema changes: `npx prisma migrate dev`
- Keep migrations reversible when possible
- Test migrations on a development database first

### API Design

- Follow RESTful conventions for REST API endpoints
- Use tRPC procedures for internal API calls
- Validate all inputs using Zod schemas
- Return appropriate HTTP status codes

## Testing

- Write unit tests for services and utilities
- Write integration tests for API endpoints
- Aim for >80% code coverage on critical paths
- Test edge cases and error handling

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for complex functions
- Document environment variables in .env.example
- Update API documentation for endpoint changes

## Security

- Never commit sensitive data (API keys, passwords, etc.)
- Use environment variables for configuration
- Validate and sanitize all user inputs
- Follow OWASP security best practices
- Report security vulnerabilities privately to the maintainers

## Database Changes

When making database changes:

1. Create a migration: `npx prisma migrate dev --name your-migration-name`
2. Update the Prisma schema
3. Generate Prisma client: `npx prisma generate`
4. Test the migration thoroughly
5. Document breaking changes in the PR description

## Pull Request Process

1. **Ensure all tests pass** and there are no linting errors
2. **Update documentation** for any user-facing changes
3. **Add tests** for new functionality
4. **Request review** from maintainers
5. **Address feedback** promptly and respectfully
6. **Squash commits** if requested before merging

## Code Review Guidelines

When reviewing code:

- Be constructive and respectful
- Focus on code quality, not personal preferences
- Suggest improvements with examples
- Approve when the code meets quality standards

## Getting Help

- **Questions?** Open a discussion on GitHub
- **Bugs?** Open an issue with reproduction steps
- **Feature requests?** Open an issue with detailed use cases

## License

By contributing to LWD Invoices, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- The project's contributor list
- Release notes for significant contributions

Thank you for contributing to LWD Invoices!
