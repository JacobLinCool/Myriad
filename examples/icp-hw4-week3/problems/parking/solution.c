#include <stdio.h>

#define SPACES 10
#define FEE 60

int spaces[SPACES];
int entered, left, revenue;

int next_ticket_number(void) {
    static int ticket = 101;
    return ticket++;
}

int find_empty_space(void) {
    for (int i = 0; i < SPACES; i++)
        if (spaces[i] == 0) return i;
    return -1;
}

int find_car(int car_id) {
    for (int i = 0; i < SPACES; i++)
        if (spaces[i] == car_id) return i;
    return -1;
}

void park_car(int car_id) {
    int space = find_empty_space();
    if (space < 0) {
        printf("Sorry, the parking lot is full.\n");
        return;
    }
    spaces[space] = car_id;
    entered++;
    printf("Car %d parked at space %d.\n", car_id, space + 1);
    printf("Ticket number: %d\n", next_ticket_number());
}

void remove_car(int car_id) {
    int space = find_car(car_id);
    if (space < 0) {
        printf("Sorry, car ID %d was not found.\n", car_id);
        return;
    }
    spaces[space] = 0;
    left++;
    revenue += FEE;
    printf("Car %d left space %d.\n", car_id, space + 1);
    printf("Parking fee: $%d\n", FEE);
}

void print_status(void) {
    int available = 0;
    printf("=== Parking Status ===\n");
    for (int i = 0; i < SPACES; i++) {
        if (spaces[i] == 0) {
            printf("Space %d: Empty\n", i + 1);
            available++;
        } else {
            printf("Space %d: Car %d\n", i + 1, spaces[i]);
        }
    }
    printf("\nAvailable spaces: %d\n", available);
    printf("Cars entered today: %d\n", entered);
    printf("Cars left today: %d\n", left);
    printf("Total revenue: $%d\n", revenue);
    printf("======================\n");
}

int main(void) {
    int option, car_id;
    while (scanf("%d", &option) == 1 && option != 0) {
        if (option == 1 && scanf("%d", &car_id) == 1) park_car(car_id);
        else if (option == 2 && scanf("%d", &car_id) == 1) remove_car(car_id);
        else if (option == 3) print_status();
        else printf("Invalid option ID. Please try again.\n");
    }
    return 0;
}
