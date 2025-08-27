import { Vector2 } from '../src/types';

describe('Vector2', () => {
  it('should create a vector with the correct components', () => {
    const v = new Vector2(1, 2);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
  });

  it('should clone a vector', () => {
    const v1 = new Vector2(3, 4);
    const v2 = v1.clone();
    expect(v2.x).toBe(3);
    expect(v2.y).toBe(4);
    expect(v1).not.toBe(v2);
  });

  it('should add two vectors', () => {
    const v1 = new Vector2(1, 2);
    const v2 = new Vector2(3, 4);
    v1.add(v2);
    expect(v1.x).toBe(4);
    expect(v1.y).toBe(6);
  });

  it('should multiply a vector by a scalar', () => {
    const v = new Vector2(2, 3);
    v.multiply(3);
    expect(v.x).toBe(6);
    expect(v.y).toBe(9);
  });

  it('should calculate the magnitude', () => {
    const v = new Vector2(3, 4);
    expect(v.magnitude()).toBe(5);
  });

  it('should normalize a vector', () => {
    const v = new Vector2(3, 4);
    v.normalize();
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });
});
