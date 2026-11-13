-- Las horas extra deben liquidarse por su factor total (hora completa con recargo),
-- mientras que los recargos (nocturno, dominical/festivo ordinario) pagan solo el
-- porcentaje adicional sobre la hora ordinaria ya remunerada. El motor de liquidacion
-- respeta el value_type configurable de cada concepto; aqui corregimos el dato para que
-- las horas extra existentes conserven su factor total.
UPDATE th_conceptos_recargo
SET value_type = 'factor_total'
WHERE code IN ('HED', 'HEN', 'HEDD', 'HEND')
  AND value_type <> 'factor_total';
