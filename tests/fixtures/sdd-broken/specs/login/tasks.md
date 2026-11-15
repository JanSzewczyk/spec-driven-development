# Tasks: Login

**Spec:** `specs/login/spec.md`  **Plan:** `specs/login/plan.md`
**Epic:** nope

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
acceptance: AC9
scope:
- a
files: apps/web/*
