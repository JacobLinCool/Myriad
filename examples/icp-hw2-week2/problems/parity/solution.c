#include <stdio.h>

int main(void) {
    int n;
    while (scanf("%d", &n) == 1) {
        if (n == 0) break;
        if (n < 0) {
            printf("Negative number is not allowed.\n");
            continue;
        }
        printf("%d is %s.\n", n, n % 2 == 0 ? "even" : "odd");
    }
    printf("Program terminated.\n");
    return 0;
}
