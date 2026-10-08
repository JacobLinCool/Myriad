#include <stdio.h>
#include <string.h>

static char stack[100005];

int main(void) {
    static char s[100005];
    if (scanf("%100004s", s) != 1) {
        printf("YES\n");
        return 0;
    }
    int top = 0;
    int len = strlen(s);
    for (int i = 0; i < len; i++) {
        char c = s[i];
        if (c == '(' || c == '[' || c == '{') {
            stack[top++] = c;
        } else {
            if (top == 0) {
                printf("NO\n");
                return 0;
            }
            char open = stack[--top];
            if ((c == ')' && open != '(') ||
                (c == ']' && open != '[') ||
                (c == '}' && open != '{')) {
                printf("NO\n");
                return 0;
            }
        }
    }
    if (top == 0) {
        printf("YES\n");
    } else {
        printf("NO\n");
    }
    return 0;
}
