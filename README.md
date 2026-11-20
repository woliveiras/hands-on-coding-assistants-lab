# Hands-on Coding Assistants lab

Fork this repository to follow [Hands-on Coding Assistants](https://woliveiras.com/books/hands-on-coding-assistants/). The Task API uses Node.js 24 and its standard library. You can run the starter without installing application packages.

```sh
git fetch https://github.com/woliveiras/hands-on-coding-assistants-lab.git --tags
git switch -c explore-api lab-start
npm test
npm start
```

Use a new terminal to check `curl -i http://127.0.0.1:3000/health`. Expect HTTP 200 and `{"status":"ok"}`. Stop the server with Ctrl+C. Restarting it resets the example data. Set `PORT` before starting if port 3000 is in use.

| Command | Expected at `lab-start` |
| --- | --- |
| `npm test` | Three tests pass. |
| `npm run test:registration` | Two tests fail until you implement the registration contract. |
| `npm run test:labels` | The labels contract fails until you implement the feature. |
| `npm run test:mcp` | The local stdio smoke test passes. |

Start each exercise from the tag named in the book. Commit work you want to keep before switching bases. The tags reproduce specific states, including the two deliberately faulty versions.

| Tag | Starting point |
| --- | --- |
| `lab-start` | Starter Task API |
| `lab-registration` | Accepted registration behavior |
| `lab-debugging` | Rejects invalid registrations and accidentally consumes IDs |
| `lab-review` | Registration tests pass, but a 100-character name is rejected |
| `lab-observability` | Docker Compose lab with synthetic incident data |
| `lab-coverage` | Registration fix, focused tests, and coverage gate |
| `lab-harness` | Coverage, CI workflow, and Docker Compose lab |
| `lab-labels` | Reference implementation of searchable labels in memory |

Use fictional requests and lab credentials when you work with a hosted model.
