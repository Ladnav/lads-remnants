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

/** Refugiados que podem bater na porta. */
export const RECRUITS: readonly Omit<SurvivorDef, 'maxHp'>[] = [
  { id: 'bruno', name: 'Bruno', bio: 'Motorista da linha 412. Sabe chegar em qualquer bairro sem olhar placa.', traits: ['forte'] },
  { id: 'ana', name: 'Ana', bio: 'Dava aula de matemática no estadual. Ainda corrige quem fala errado.', traits: ['silencioso', 'medroso'] },
  { id: 'caio', name: 'Caio', bio: 'Quinze anos. Diz que tem dezoito.', traits: ['silencioso'] },
  { id: 'dona_rita', name: 'Dona Rita', bio: 'Costureira aposentada. Não aceita desperdício de nada.', traits: ['mecanico'] },
  { id: 'teo', name: 'Téo', bio: 'Dava aula de jiu-jítsu numa academia de garagem. Acorda com qualquer barulho.', traits: ['lutador', 'medroso'] },
];

export const SURVIVORS: readonly SurvivorDef[] = [
  {
    id: 'marta',
    name: 'Marta',
    bio: 'Era eletricista da prefeitura. Perdeu o irmão na primeira semana e quase não dorme.',
    traits: ['mecanico', 'medroso'],
    maxHp: 3,
  },
  {
    id: 'iuri',
    name: 'Iuri',
    bio: 'Ex-segurança de shopping. Teimoso, mas é o primeiro a ir quando alguém precisa.',
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
