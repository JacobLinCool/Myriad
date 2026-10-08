# Valid Parentheses

## Description
Given a bracket sequence containing characters `(`, `)`, `[`, `]`, `{`, and `}`, determine if the input string is valid.

A bracket string is valid if:
1. Open brackets are closed by the same type of brackets.
2. Open brackets are closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.

## Input
A single line containing the string $S$ ($1 \le |S| \le 100,000$).

## Output
Output `YES` if the sequence is valid, or `NO` otherwise.

## Constraints
- **Subtask 1 (20%):** Only `(` and `)`, length $\le 10$
- **Subtask 2 (20%):** Only `(` and `)`, length $\le 1,000$
- **Subtask 3 (20%):** All bracket types, length $\le 50$
- **Subtask 4 (20%):** All bracket types, length $\le 2,000$
- **Subtask 5 (20%):** Deep nesting & length up to $50,000$
