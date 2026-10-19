import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findWorkingPortForCandidates,
  validateEndpointPort,
  type ProcessCandidate,
} from '../src/discovery';

describe('HITO 1: Validación rigurosa de endpoint y descarte de fallback ciego (discovery.ts)', () => {
  it('(a) candidato que falla la sonda no produce conexión (retorna null)', async () => {
    const candidates: ProcessCandidate[] = [
      {
        pid: 12345,
        csrfToken: 'test-token-failing',
        extensionPort: 54321,
      },
    ];

    // Simular que el proceso escucha en los puertos 54321 y 54322,
    // pero la sonda de validación rechaza ambos (servidor no responde o devuelve error).
    const mockScanner = async (_pid: number) => [54321, 54322];
    const mockValidator = async (_port: number, _token: string) => false;

    const result = await findWorkingPortForCandidates(candidates, mockScanner, mockValidator);

    // En la implementación anterior esto habría retornado el primer puerto (54321) como fallback.
    // Con el hardening debe retornar estrictamente null.
    assert.strictEqual(
      result,
      null,
      'Candidato que no supera la sonda debe retornar null y no caer en fallback',
    );
  });

  it('(b) candidato válido sí conecta cuando supera la sonda', async () => {
    const candidates: ProcessCandidate[] = [
      {
        pid: 23456,
        csrfToken: 'valid-secret-token',
        extensionPort: 60100,
      },
    ];

    // Simular que escucha en el puerto 60100 y la sonda confirma que es el endpoint legítimo
    const mockScanner = async (_pid: number) => [60100];
    const mockValidator = async (port: number, token: string) => {
      return port === 60100 && token === 'valid-secret-token';
    };

    const result = await findWorkingPortForCandidates(candidates, mockScanner, mockValidator);

    assert.notStrictEqual(result, null);
    assert.strictEqual(result?.port, 60100);
    assert.strictEqual(result?.csrfToken, 'valid-secret-token');
    assert.strictEqual(result?.pid, 23456);
  });

  it('selecciona el puerto que valida cuando el proceso tiene múltiples puertos y los primeros fallan', async () => {
    const candidates: ProcessCandidate[] = [
      {
        pid: 34567,
        csrfToken: 'multi-port-token',
        extensionPort: 50001,
      },
    ];

    // Puerto 50001 falla la sonda, pero 50002 la pasa exitosamente
    const mockScanner = async (_pid: number) => [50001, 50002, 50003];
    const mockValidator = async (port: number, _token: string) => port === 50002;

    const result = await findWorkingPortForCandidates(candidates, mockScanner, mockValidator);

    assert.notStrictEqual(result, null);
    assert.strictEqual(result?.port, 50002, 'Debe conectarse al puerto que validó la sonda');
    assert.strictEqual(result?.pid, 34567);
  });

  it('evalúa múltiples candidatos hasta encontrar el primero con un puerto que valida', async () => {
    const candidates: ProcessCandidate[] = [
      {
        pid: 40001,
        csrfToken: 'zombie-token',
        extensionPort: 41001,
      },
      {
        pid: 40002,
        csrfToken: 'active-token',
        extensionPort: 41002,
      },
    ];

    // El primer candidato falla en todos sus puertos; el segundo pasa en el puerto 41002
    const mockScanner = async (pid: number) => (pid === 40001 ? [41001] : [41002]);
    const mockValidator = async (port: number, _token: string) => port === 41002;

    const result = await findWorkingPortForCandidates(candidates, mockScanner, mockValidator);

    assert.notStrictEqual(result, null);
    assert.strictEqual(result?.pid, 40002);
    assert.strictEqual(result?.port, 41002);
    assert.strictEqual(result?.csrfToken, 'active-token');
  });

  it('validateEndpointPort degrada graciosamente a false ante un puerto cerrado', async () => {
    // Puerto no reservado que no está escuchando
    const isValid = await validateEndpointPort(65530, 'dummy-token');
    assert.strictEqual(isValid, false, 'Puerto inalcanzable debe devolver false sin lanzar excepción');
  });
});
