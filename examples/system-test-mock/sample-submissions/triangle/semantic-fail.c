#include <stdio.h>

int classify_triangle(int a, int b, int c) {
    if (a + b <= c || a + c <= b || b + c <= a) return 0;
    if (a == b && b == c) return 3;
    if (a == b || b == c || a == c) return 2;
    return 1;
}
int main(void) {
    int a, b, c;
    if (scanf("%d %d %d", &a, &b, &c) != 3) return 0;
    int kind = (a+b<=c || a+c<=b || b+c<=a) ? 0 : (a==b && b==c) ? 3 : (a==b || b==c || a==c) ? 2 : 1;
    if (kind == 0) puts("INVALID");
    else if (kind == 3) puts("EQUILATERAL");
    else if (kind == 2) puts("ISOSCELES");
    else puts("SCALENE");

    return 0;
}
