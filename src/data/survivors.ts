export type TraitId = 'mecanico' | 'silencioso' | 'forte' | 'lutador' | 'medroso';

export interface TraitDef {
  name: string;
  description: string;
  negative?: boolean;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  mecanico: { name: 'Mecânico', description: 'Abre fechaduras em 1 turno.' },
  silencioso: { name: 'Silencioso', description: 'Passos fazem metade do ruído.' },
  forte: { name: 'Forte', description: 'Carrega 14 de peso em vez de 10.' },
  lutador: { name: 'Lutador', description: 'Acerta 90% dos golpes (normal: 70%).' },
  medroso: { name: 'Medroso', description: 'Pode travar de medo com zumbis por perto.', negative: true },
};

export interface SurvivorDef {
  id: string;
  name: string;
  bio: string;
  traits: TraitId[];
  maxHp: number;
}

export const SURVIVORS: readonly SurvivorDef[] = [
  {
    id: 'marta',
    name: 'Marta',
    bio: 'Era eletricista. Fala pouco, conserta tudo e não dorme desde que perdeu o irmão.',
    traits: ['mecanico', 'medroso'],
    maxHp: 3,
  },
  {
    id: 'iuri',
    name: 'Iuri',
    bio: 'Ex-segurança de shopping. Grande, teimoso e leal ao grupo.',
    traits: ['forte', 'lutador'],
    maxHp: 3,
  },
  {
    id: 'lena',
    name: 'Lena',
    bio: 'Estudante de enfermagem. Aprendeu a andar sem fazer barulho nas primeiras noites.',
    traits: ['silencioso'],
    maxHp: 3,
  },
];
