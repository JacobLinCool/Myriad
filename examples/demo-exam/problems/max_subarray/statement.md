# Maximum Subarray Sum

## Description
Given an array of $N$ integers $A_1, A_2, \dots, A_N$, find the contiguous non-empty subarray which has the largest sum:
$$ \max_{1 \le i \le j \le N} \sum_{k=i}^{j} A_k $$

## Input
The first line contains a single integer $N$ ($1 \le N \le 100,000$).
The second line contains $N$ space-separated integers $A_1, A_2, \dots, A_N$ ($-10^9 \le A_i \le 10^9$).

## Output
Output a single integer representing the maximum contiguous subarray sum.

## Constraints
- **Subtask 1 (20%):** $N \le 20$, all $A_i \ge 0$
- **Subtask 2 (20%):** $N \le 50$, with negative values
- **Subtask 3 (20%):** $N \le 1,000$, $-10^4 \le A_i \le 10^4$
- **Subtask 4 (20%):** $N \le 10,000$, all negative numbers
- **Subtask 5 (20%):** $N \le 50,000$, full 64-bit range
