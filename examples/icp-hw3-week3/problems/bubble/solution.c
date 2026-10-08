#include <stdio.h>

#define N 8

void bubble_sort(int a[N]) {
    for (int i = 1; i <= N; i++)
        for (int j = 0; j <= N - 2; j++)
            if (a[j] > a[j + 1]) {
                int t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
}

int main(void) {
    int t, a[N];
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0) {
        for (int i = 0; i < N; i++)
            if (scanf("%d", &a[i]) != 1) return 0;
        bubble_sort(a);
        for (int i = 0; i < N; i++)
            printf(i ? " %d" : "%d", a[i]);
        printf("\n");
    }
    return 0;
}
