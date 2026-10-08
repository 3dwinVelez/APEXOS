-- Vehicle master catalogs for the transport fleet ficha.
-- Non destructive: seeds global master_catalogs/master_catalog_items entries
-- (on conflict do nothing) so every tenant starts with selectable lists that
-- can be extended per company from Administracion > Catalogos maestros.

with catalogs(code, name, description, scope, sort_order) as (
  values
    ('vehicle_categories', 'Categorias vehiculares', 'Clasificacion de peso/tipo de servicio del vehiculo.', 'mixed', 110),
    ('vehicle_brands', 'Marcas de vehiculo', 'Marcas registradas para la flota.', 'mixed', 120),
    ('vehicle_lines', 'Lineas de vehiculo', 'Lineas o referencias por marca (parent_code = marca).', 'mixed', 130),
    ('vehicle_colors', 'Colores de vehiculo', 'Colores habituales de la flota.', 'mixed', 140),
    ('vehicle_fuels', 'Combustibles', 'Tipos de combustible/alimentacion.', 'mixed', 150),
    ('vehicle_body_types', 'Carrocerias', 'Tipos de carroceria.', 'mixed', 160)
)
insert into public.master_catalogs (code, name, description, scope, sort_order)
select code, name, description, scope, sort_order
from catalogs
on conflict do nothing;

with catalog_items(catalog_code, code, name, sort_order) as (
  values
    ('vehicle_types', 'motocicleta', 'Motocicleta', 40),
    ('vehicle_types', 'automovil', 'Automovil', 50),
    ('vehicle_types', 'buseta', 'Buseta', 60),
    ('vehicle_types', 'bus', 'Bus', 70),
    ('vehicle_types', 'camion_tracto', 'Camion tracto', 80),
    ('vehicle_types', 'volqueta', 'Volqueta', 90),
    ('vehicle_categories', 'motocicleta', 'Motocicleta', 10),
    ('vehicle_categories', 'liviano', 'Liviano', 20),
    ('vehicle_categories', 'utilitario', 'Utilitario', 30),
    ('vehicle_categories', 'camion_liviano', 'Camion liviano', 40),
    ('vehicle_categories', 'camion_mediano', 'Camion mediano', 50),
    ('vehicle_categories', 'camion_pesado', 'Camion pesado', 60),
    ('vehicle_categories', 'articulado', 'Articulado / tractomula', 70),
    ('vehicle_brands', 'toyota', 'Toyota', 10),
    ('vehicle_brands', 'chevrolet', 'Chevrolet', 20),
    ('vehicle_brands', 'renault', 'Renault', 30),
    ('vehicle_brands', 'nissan', 'Nissan', 40),
    ('vehicle_brands', 'mazda', 'Mazda', 50),
    ('vehicle_brands', 'ford', 'Ford', 60),
    ('vehicle_brands', 'volkswagen', 'Volkswagen', 70),
    ('vehicle_brands', 'mercedes_benz', 'Mercedes-Benz', 80),
    ('vehicle_brands', 'hyundai', 'Hyundai', 90),
    ('vehicle_brands', 'kia', 'Kia', 100),
    ('vehicle_brands', 'iveco', 'Iveco', 110),
    ('vehicle_brands', 'hino', 'Hino', 120),
    ('vehicle_colors', 'blanco', 'Blanco', 10),
    ('vehicle_colors', 'negro', 'Negro', 20),
    ('vehicle_colors', 'gris', 'Gris', 30),
    ('vehicle_colors', 'plata', 'Plata', 40),
    ('vehicle_colors', 'rojo', 'Rojo', 50),
    ('vehicle_colors', 'azul', 'Azul', 60),
    ('vehicle_colors', 'verde', 'Verde', 70),
    ('vehicle_colors', 'amarillo', 'Amarillo', 80),
    ('vehicle_colors', 'naranja', 'Naranja', 90),
    ('vehicle_colors', 'beige', 'Beige', 100),
    ('vehicle_colors', 'cafe', 'Cafe', 110),
    ('vehicle_colors', 'vinotinto', 'Vinotinto', 120),
    ('vehicle_fuels', 'gasolina', 'Gasolina', 10),
    ('vehicle_fuels', 'diesel', 'Diesel', 20),
    ('vehicle_fuels', 'gnv', 'Gas natural (GNV)', 30),
    ('vehicle_fuels', 'gnv_gasolina', 'Gasolina + GNV', 40),
    ('vehicle_fuels', 'electrico', 'Electrico', 50),
    ('vehicle_fuels', 'hibrido', 'Hibrido', 60),
    ('vehicle_body_types', 'estacas', 'Estacas', 10),
    ('vehicle_body_types', 'caja_seca', 'Caja seca', 20),
    ('vehicle_body_types', 'furgon', 'Furgon', 30),
    ('vehicle_body_types', 'plataforma', 'Plataforma', 40),
    ('vehicle_body_types', 'tanque', 'Tanque', 50),
    ('vehicle_body_types', 'volco', 'Volco', 60),
    ('vehicle_body_types', 'refrigerado', 'Refrigerado', 70),
    ('vehicle_body_types', 'porta_contenedores', 'Porta contenedores', 80),
    ('vehicle_body_types', 'cama_baja', 'Cama baja', 90),
    ('units_of_measure', 'TON', 'Tonelada', 40),
    ('units_of_measure', 'M3', 'Metro cubico', 50),
    ('units_of_measure', 'LB', 'Libra', 60)
)
insert into public.master_catalog_items (catalog_id, code, name, sort_order)
select c.id, i.code, i.name, i.sort_order
from catalog_items i
join public.master_catalogs c on c.code = i.catalog_code and c.company_id is null
on conflict do nothing;

with line_items(code, name, sort_order, parent_code) as (
  values
    ('hilux', 'Hilux', 10, 'toyota'),
    ('fortuner', 'Fortuner', 20, 'toyota'),
    ('nhr', 'NHR', 10, 'chevrolet'),
    ('npr', 'NPR', 20, 'chevrolet'),
    ('dmax', 'D-Max', 30, 'chevrolet'),
    ('spark_gt', 'Spark GT', 40, 'chevrolet'),
    ('kangoo', 'Kangoo', 10, 'renault'),
    ('trafic', 'Trafic', 20, 'renault'),
    ('logan', 'Logan', 30, 'renault'),
    ('frontier', 'Frontier', 10, 'nissan'),
    ('urvan', 'Urvan', 20, 'nissan'),
    ('bt50', 'BT-50', 10, 'mazda'),
    ('ranger', 'Ranger', 10, 'ford'),
    ('transit', 'Transit', 20, 'ford'),
    ('amarok', 'Amarok', 10, 'volkswagen'),
    ('delivery', 'Delivery', 20, 'volkswagen'),
    ('sprinter', 'Sprinter', 10, 'mercedes_benz'),
    ('atego', 'Atego', 20, 'mercedes_benz'),
    ('daily', 'Daily', 10, 'iveco'),
    ('dutro', 'Dutro', 10, 'hino')
)
insert into public.master_catalog_items (catalog_id, code, name, sort_order, parent_code)
select c.id, i.code, i.name, i.sort_order, i.parent_code
from line_items i
join public.master_catalogs c on c.code = 'vehicle_lines' and c.company_id is null
on conflict do nothing;
