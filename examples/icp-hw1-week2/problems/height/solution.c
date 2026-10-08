#include <stdio.h>

#define INCHES_PER_FOOT 12
#define CM_PER_INCH 2.54

int main(void) {
    int t, feet, inches;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0 && scanf("%d %d", &feet, &inches) == 2) {
        double cm = (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
        printf("Height in centimeters = %.1f cm\n", cm);
    }
    return 0;
}
