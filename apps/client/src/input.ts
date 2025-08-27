import { eventBus } from '@shared/eventBus';

export class InputManager {
    private keys: { [key: string]: boolean } = {};
    public leftBlinker = false;
    public rightBlinker = false;
    public cruiseControlToggle = false;

    constructor() {
        window.addEventListener('keydown', (e) => this.onKey(e, true));
        window.addEventListener('keyup', (e) => this.onKey(e, false));
    }

    private onKey(event: KeyboardEvent, isPressed: boolean) {
        const oldState = this.keys[event.code];
        this.keys[event.code] = isPressed;

        // Toggle blinkers on key down
        if (isPressed && !oldState) {
            if (event.code === 'KeyQ') {
                this.leftBlinker = !this.leftBlinker;
                if (this.leftBlinker) this.rightBlinker = false;
            }
            if (event.code === 'KeyE') {
                this.rightBlinker = !this.rightBlinker;
                if (this.rightBlinker) this.leftBlinker = false;
            }
            if (event.code === 'KeyR') {
                this.cruiseControlToggle = true; // This will be reset by the game loop
            }
        }
    }

    isPressed(code: string): boolean {
        return this.keys[code] || false;
    }

    getAxis(positive: string, negative: string): number {
        let axis = 0;
        if (this.isPressed(positive)) axis++;
        if (this.isPressed(negative)) axis--;
        return axis;
    }
}
