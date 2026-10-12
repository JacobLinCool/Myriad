#include <stdio.h>

int classify_triangle(int a, int b, int c) {
    if (a + b <= c || a + c <= b || b + c <= a) return 0;
    if (a == b && b == c) return 3;
    if (a == b || b == c || a == c) return 2;
    return 1;
}
int triangle_perimeter(int a, int b, int c) {
    return classify_triangle(a, b, c) == 0 ? 0 : a + b + c;
}
int main(void) {
    int a, b, c;
    if (scanf("%d %d %d", &a, &b, &c) != 3) return 0;
    int kind = classify_triangle(a, b, c);
    if (kind == 0) puts("INVALID");
    else if (kind == 3) puts("EQUILATERAL");
    else if (kind == 2) puts("ISOSCELES");
    else puts("SCALENE");
    printf("%d\n", triangle_perimeter(a, b, c));
    return 0;
}
