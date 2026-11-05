import { findPin } from '../boards';
import { connect, type Connectivity } from './connectivity';
import type { Device, Netlist } from './devices';
import { MODELS } from './models';
import type { CircuitSpec } from './spec';

/** The circuit → nets (connect) → the devices each part, pin and supply becomes (architecture §2.5). */
export function toNetlist(spec: CircuitSpec): { netlist: Netlist; connectivity: Connectivity } {
  const c = connect(spec);
  const devices: Device[] = [];
  const extraNets: string[] = [];
  const net = (point: string) => c.netOf(point)!;
  const board = spec.board?.data;
  let ground: string | undefined;

  if (board) {
    const gnd = net(`board.${board.pins.find((p) => p.role === 'ground')!.id}`);   // every board has one (schema)
    ground = gnd;

    for (const s of board.supplies) {
      if (s.usbOnly && spec.board!.usb === false) continue;
      devices.push({ kind: 'source', id: `supply:${s.pin}`, plus: net(`board.${s.pin}`), minus: gnd, volts: s.volts, ohms: s.ohms, limitA: s.limitMa / 1000 });
    }
    for (const p of board.pins) {
      if (p.role !== 'gpio') continue;
      devices.push({
        kind: 'pin', id: `pin:${p.label}`, net: net(`board.${p.id}`), gnd, label: p.label,
        volts: board.logicVolts, ohms: board.gpio.outputOhms, limitA: board.gpio.shortCircuitMa / 1000,
        pullOhms: board.gpio.pullOhms, noPulls: p.noPulls,
      });
    }
    for (const part of board.builtIn) {
      if (part.kind === 'resistor') {
        devices.push({ kind: 'resistor', id: `board.${part.id}`, a: net(`board.${part.a}`), b: net(`board.${part.b}`), ohms: part.ohms });
      } else if (part.kind === 'button') {
        devices.push({ kind: 'switch', id: `board.${part.id}`, a: net(`board.${part.a}`), b: net(`board.${part.b}`), part: `board.${part.id}`, closedWhen: 'pressed' });
      } else {
        const mid = `board.${part.id}#r`;
        extraNets.push(mid);
        devices.push(
          { kind: 'resistor', id: `board.${part.id}:r`, a: net(`board.${findPin(board, part.pin)!.id}`), b: mid, ohms: part.ohms },
          { kind: 'led', id: `board.${part.id}`, a: mid, k: gnd, color: part.color },
        );
      }
    }
  }

  for (const part of spec.parts) {
    const model = MODELS[part.type];
    if (!model) continue;   // reported by connect() as unknown-part-type
    devices.push(...model.devices({ id: part.id, leg: (name) => net(`${part.id}.${name}`), props: part.props ?? {} }));
  }

  const nets = [...c.nets.map((n) => n.id), ...extraNets];
  return { netlist: { nets, ground: ground ?? nets[0], devices }, connectivity: c };
}
