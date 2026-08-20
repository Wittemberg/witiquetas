export interface CanonicalFieldDefinition {
  key: string;
  label: string;
  category: 'produto' | 'empresa' | 'impressao' | 'promocao' | 'sistema';
  exampleValue: string;
}

export const CANONICAL_FIELDS: CanonicalFieldDefinition[] = [
  // Campos do Produto (Integração)
  { key: 'produto.codigo', label: 'Código do Produto', category: 'produto', exampleValue: '789123' },
  { key: 'produto.descricao', label: 'Descrição Curta', category: 'produto', exampleValue: 'REFRIGERANTE COCA-COLA 2L' },
  { key: 'produto.descricaoLonga', label: 'Descrição Completa', category: 'produto', exampleValue: 'REFRIGERANTE COCA-COLA PET 2 LITROS - EMBALAGEM FAMÍLIA' },
  { key: 'produto.ean', label: 'Código EAN-13', category: 'produto', exampleValue: '7894900011517' },
  { key: 'produto.unidade', label: 'Unidade Comercial', category: 'produto', exampleValue: 'UN' },
  { key: 'produto.preco', label: 'Preço Normal (R$)', category: 'produto', exampleValue: '9.99' },
  
  // Promoção (Integração)
  { key: 'produto.promocao', label: 'Promoção (Ativa/Valor)', category: 'promocao', exampleValue: '7.99' },
  { key: 'produto.promocao.preco', label: 'Preço Promocional (R$)', category: 'promocao', exampleValue: '7.99' },
  { key: 'produto.promocao.inicio', label: 'Início Promoção', category: 'promocao', exampleValue: '10/08/2026' },
  { key: 'produto.promocao.fim', label: 'Fim Promoção', category: 'promocao', exampleValue: '20/08/2026' },
  
  // Referência & Fabricante (Integração)
  { key: 'produto.referencia.unidade', label: 'Unidade de Ref. (Ex: 1L, 1kg)', category: 'produto', exampleValue: '1L' },
  { key: 'produto.referencia.preco', label: 'Preço por Ref. (R$/L ou R$/kg)', category: 'produto', exampleValue: '5.00' },
  { key: 'produto.fabricante', label: 'Fabricante / Marca', category: 'produto', exampleValue: 'COCA-COLA' },
  
  // Empresa (Integração)
  { key: 'empresa.razaoSocial', label: 'Razão Social Empresa', category: 'empresa', exampleValue: 'WR TECNOLOGIA SUPERMERCADOS LTDA' },
  { key: 'empresa.nomeFantasia', label: 'Nome Fantasia', category: 'empresa', exampleValue: 'SUPERMERCADO WR' },
  { key: 'empresa.nomeFilial', label: 'Nome da Filial', category: 'empresa', exampleValue: 'MATRIZ SÃO PAULO' },
  
  // Campos do Sistema Witiquetas
  { key: 'system.printDateTime', label: 'Data e Hora de Impressão', category: 'sistema', exampleValue: '20/08/2026 12:35' },
  { key: 'system.printDate', label: 'Data de Impressão', category: 'sistema', exampleValue: '20/08/2026' },
  { key: 'system.printTime', label: 'Hora de Impressão', category: 'sistema', exampleValue: '12:35' },
  { key: 'impressao.data', label: 'Data de Impressão (Legado)', category: 'impressao', exampleValue: '13/08/2026' },
  { key: 'impressao.hora', label: 'Hora de Impressão (Legado)', category: 'impressao', exampleValue: '19:30' },
];
