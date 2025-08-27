import { Vector2 } from '@shared/types';
import { Vehicle } from './vehicle';

export class Camera {
    position: Vector2;
    private target: Vehicle;
    private lerpFactor: number;

    constructor(target: Vehicle, lerpFactor = 0.1) {
        this.target = target;
        this.position = target.position.clone();
        this.lerpFactor = lerpFactor;
    }

    update() {
        const targetPos = this.target.position;
        this.position.x += (targetPos.x - this.position.x) * this.lerpFactor;
        this.position.y += (targetPos.y - this.position.y) * this.lerpFactor;
    }
}
