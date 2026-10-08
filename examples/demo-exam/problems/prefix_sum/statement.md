# Prefix Sum Queries

## Description
Given an array of $N$ integers $A_1, A_2, \dots, A_N$ and $Q$ range sum queries, for each query $(L, R)$, calculate:
$$ \sum_{i=L}^{R} A_i $$

## Input
The first line contains two integers $N$ and $Q$.
The second line contains $N$ space-separated integers $A_1, A_2, \dots, A_N$.
The next $Q$ lines each contain two 1-indexed integers $L$ and $R$ ($1 \le L \le R \le N$).

## Output
For each query, output the range sum on a new line.

## Constraints
- **Subtask 1 (20%):** $N, Q \le 10$, $0 \le A_i \le 100$
- **Subtask 2 (20%):** $N, Q \le 100$, $-1,000 \le A_i \le 1,000$
- **Subtask 3 (20%):** $N, Q \le 1,000$, all $A_i \ge 0$
- **Subtask 4 (20%):** $N, Q \le 5,000$, $-10^9 \le A_i \le 10^9$
- **Subtask 5 (20%):** $N, Q \le 10,000$, full 64-bit sum
