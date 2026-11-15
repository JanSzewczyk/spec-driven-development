# Tasks: Login

**Spec:** `specs/login/spec.md`  **Plan:** `specs/login/plan.md`
**Epic:** LOG-7f3a

## Epic: Login

### T1: API
project: api
status: draft
depends_on: []
acceptance: AC1
scope:
- a
files: apps/api/*

### T2: Web
project: web
status: draft
depends_on: [T1]
acceptance: AC2
scope:
- a
files: apps/web/*
