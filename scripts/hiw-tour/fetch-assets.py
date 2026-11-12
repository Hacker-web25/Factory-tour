import json,urllib.request,os,sys,concurrent.futures as cf
import urllib.request as _u
_o=_u.build_opener(); _o.addheaders=[('User-Agent','Mozilla/5.0 vpv-asset-fetch')]; _u.install_opener(_o)
models=['drill_press_01','steel_frame_shelves_01','plastic_crate_03','industrial_pastic_container','cardboard_box_01','mounted_fluorescent_lights','tool_cart','industrial_storage_cart','portable_welding_cart','hand_truck','korean_fire_extinguisher_01','security_camera_02','WetFloorSign_01','power_box_01','modular_airduct_rectangular_01','industrial_microscope','Barrel_01','metal_tool_chest']
def get(u,p):
    if os.path.exists(p): return
    os.makedirs(os.path.dirname(p),exist_ok=True)
    urllib.request.urlretrieve(u,p)
def model(m,res='1k'):
    f=json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{m}'))
    g=f['gltf'][res]['gltf']; jobs=[(g['url'],f'raw/{m}/{m}.gltf')]
    for k,v in g['include'].items(): jobs.append((v['url'],f'raw/{m}/{k}'))
    for u,p in jobs: get(u,p)
    return m, sum(os.path.getsize(p) for _,p in jobs)
def tex(t,res='1k'):
    f=json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{t}'))
    out=[]
    for key in ['Diffuse','nor_gl','arm','Rough','AO']:
        if key in f and res in f[key]:
            v=f[key][res].get('jpg'); 
            if v: p=f'raw/tex/{t}_{key}.jpg'; get(v['url'],p); out.append(p)
    return t,out
def hdri(h,res='1k'):
    f=json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{h}'))
    v=f['hdri'][res]['hdr']; p=f'raw/hdri/{h}_{res}.hdr'; get(v['url'],p); return h,os.path.getsize(p)
with cf.ThreadPoolExecutor(8) as ex:
    futs=[ex.submit(model,m) for m in models]+[ex.submit(tex,t) for t in ['smooth_concrete_floor','factory_wall','painted_concrete']]+[ex.submit(hdri,h) for h in ['empty_warehouse_01','machine_shop_02','hangar_interior']]
    for f in cf.as_completed(futs):
        try: print(f.result())
        except Exception as e: print('ERR',e)
