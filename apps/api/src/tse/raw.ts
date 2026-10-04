/**
 * Tipos (parciais) dos JSONs do TSE, conforme inspecionados no ambiente simulado.
 * Todos os valores numéricos chegam como string; decimais usam vírgula ("7,53").
 */
export interface RawSecoes { ts?: string; st?: string; pst?: string; pstn?: string }
export interface RawEleitorado { te?: string; est?: string; c?: string; pc?: string; pcn?: string; a?: string; pa?: string; pan?: string }
export interface RawVotos {
  tv?: string; vvc?: string; pvvcn?: string; vv?: string; vnom?: string; van?: string; vansj?: string
  vb?: string; pvbn?: string; vn?: string; tvn?: string; pvnn?: string; ptvnn?: string
}
export interface RawVice { tp: string; sqcand?: string; nm?: string; nmu?: string; sgp?: string }
export interface RawCand {
  n: string; sqcand: string; nm?: string; nmu?: string; dvt?: string; seq?: string; e?: string
  st?: string; vap?: string; pvap?: string; pvapn?: string; vs?: RawVice[]
}
export interface RawPartido { n: string; sg: string; nm?: string; nfed?: string; tvtn?: string; tvtl?: string; tvan?: string; cand?: RawCand[] }
export interface RawAgr { n: string; nm?: string; tp?: string; com?: string; vag?: string; par?: RawPartido[] }
export interface RawFed { n: string; sg: string; nm?: string; npar?: string[] }
export interface RawCargo { cd: string; nmn?: string; nv?: string; qe?: string; fed?: RawFed[]; agr?: RawAgr[] }
export interface RawU {
  ele?: string; t?: string; f?: string; tpabr?: string; cdabr?: string
  dg?: string; hg?: string; idg?: string; dt?: string; ht?: string
  tf?: string; and?: string
  carg?: RawCargo[]
  s?: RawSecoes; e?: RawEleitorado; v?: RawVotos
}
export interface RawAbEntry {
  and?: string; tpabr: string; cdabr: string; dt?: string; ht?: string
  s?: RawSecoes; e?: RawEleitorado
}
export interface RawAb { ele?: string; t?: string; f?: string; dg?: string; hg?: string; idg?: string; abr?: RawAbEntry[] }
export interface RawEleConfig {
  dg?: string; hg?: string; idg?: string
  pl?: {
    cd: string; c: string; dt?: string
    e?: { cd: string; cdt2?: string; nm?: string; t?: string; abr?: { cd: string; cp?: { cd: string; ds?: string; tp?: string }[] }[] }[]
  }[]
}
export interface RawMunCfg { abr?: { cd: string; ds?: string; mu?: { cd: string; cdi?: string; nm: string }[] }[] }
