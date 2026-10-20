/**
 * "1 unidade" / "3 unidades": nunca "unidade(s)". Devolve o número já com a
 * palavra certa (singular só para 1 e -1).
 */
export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${Math.abs(n) === 1 ? singular : pluralForm}`;
}
