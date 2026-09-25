---
status: accepted
---

# TypeScript on Node.js for all backend services

**Owner & Pet Manager**, **Pet Health Service**, and **Activity Manager** are implemented in TypeScript on Node.js, in this monorepo. One language covers all three services.

We considered Go and Kotlin on the JVM. Go gives smaller processes and a simpler runtime. Kotlin encodes more of the glossary (Share audiences, Activity types, Deactivation versus hard delete) directly in the type system. Both lost for v1 because the hard part of this backend is the synchronous contracts in ADR-0002, and a shared TypeScript package keeps those contracts aligned without generating clients across a language boundary. Read and write latency budgets are I/O-bound (p95 under 500 ms and 2 s), so they do not require Go’s speed or a JVM.

**Consequences.** Each service runs as its own Node.js 24 process. Node.js 24 is Active LTS as of this decision; Node.js 26 was still Current. All four packages are ECMAScript modules (`"type": "module"`, TypeScript `module` and `moduleResolution` set to `nodenext`). Types are erased at runtime, so every process boundary still needs validation. The wire protocol, HTTP framework, and datastore are separate decisions.
