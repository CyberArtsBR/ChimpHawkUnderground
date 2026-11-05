"""Original, parameterized park reconstruction. Run with Blender 4.4 --background --python.
Units: metres, Blender Z up; GLB exports Y up. The reference scan is never imported.
"""
import bpy, bmesh, math, json, random, hashlib, sys
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'assets' / 'park'
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'artifacts').mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
random.seed(41)
park = bpy.data.collections.new('STREETSKATE / PARK')
scene.collection.children.link(park)
collisions = bpy.data.collections.new('COLLISION / skateable surfaces')
scene.collection.children.link(collisions)
collisions.hide_render = True
rails = []
RAMP_SCALE = 1.3

def move_collection(o, col=park):
    for c in list(o.users_collection): c.objects.unlink(o)
    col.objects.link(o)

def texture(name, color, grain=.028):
    rng = np.random.default_rng(71)
    n = 512
    field = np.zeros((n,n), dtype=np.float32)
    for size, strength in [(4,.024),(16,.018),(64,.009),(512,grain)]:
        coarse = rng.random((size,size), dtype=np.float32)-.5
        field += np.repeat(np.repeat(coarse,n//size,0),n//size,1)*strength
    # Rolled aggregate, pores and fine tool marks; no photogrammetry textures.
    field += .006*np.sin(np.arange(n)[None,:]*.8)
    pixels = np.ones((n,n,4),dtype=np.float32)
    for c in range(3): pixels[:,:,c] = np.clip(color[c]+field,0,1)
    im = bpy.data.images.new(name, width=n,height=n)
    im.pixels.foreach_set(pixels.ravel())
    im.filepath_raw = str(OUT / (name.lower().replace(' / ','-').replace(' ','-')+'.png')); im.file_format='PNG'; im.save()
    im.pack()
    return im

def material(name, color, rough=.65, metal=0, textured=False):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    if textured:
        t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=texture(name,color)
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
    return m

concrete=material('Concrete / warm aggregate',(.61,.59,.54),.88,textured=True)
bowlmat=material('Concrete / smooth bowl',(.70,.70,.66),.72,textured=True)
deckmat=material('Composite / charcoal riding panels',(.14,.18,.20),.68,textured=True)
side=material('Steel / powder coated frame',(.065,.085,.10),.55,.35)
steel=material('Steel / brushed coping',(.55,.61,.63),.3,.85)
red=material('Paint / vermilion',(.72,.09,.035),.5,.15)
white=material('Paint / bone white',(.88,.86,.76),.78)
dark=material('Joint / graphite',(.13,.15,.14),.95)
lightmat=material('Lamp / diffuser',(.92,.93,.85),.3)
lightmat.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(.8,.85,.67,1)
lightmat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.5

def mesh(name, verts, faces, mat, skate=False, smooth=False, uvs=None, solid=False, rail_id=None):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); park.objects.link(o); me.materials.append(mat)
    uv=me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        poly.use_smooth=smooth
        for li in poly.loop_indices:
            vi=me.loops[li].vertex_index; v=me.vertices[vi].co
            normal=poly.normal
            if uvs: co=uvs[vi]
            elif abs(normal.z)>.5: co=(v.x/4,v.y/4)
            elif abs(normal.x)>.5: co=(v.y/4,v.z/4)
            else: co=(v.x/4,v.z/4)
            uv.data[li].uv=co
    o['surface']='skateable' if skate else 'decoration'
    if skate or solid:
        c=bpy.data.objects.new('COL_'+name,me.copy()); collisions.objects.link(c)
        c.hide_render=True; c.hide_set(True); c['surface']='skateable' if skate else 'solid'
        if rail_id: c['railId']=rail_id
    return o

def box(name, loc, size, mat, bevel=0, skate=False, solid=False, rail_id=None):
    x,y,z=loc; a,b,c=[s/2 for s in size]
    vs=[(x+sx*a,y+sy*b,z+sz*c) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    o=mesh(name,vs,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],mat,skate,solid=solid,rail_id=rail_id)
    if bevel:
        mod=o.modifiers.new('Small edge highlights','BEVEL'); mod.width=bevel; mod.segments=2
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o

def tube(name,a,b,r=.045,mat=steel,sides=8,solid=False,rail_id=None):
    a,b=Vector(a),Vector(b); d=(b-a).normalized()
    tangent=d.cross(Vector((0,0,1)) if abs(d.z)<.9 else Vector((0,1,0))).normalized()
    bitangent=d.cross(tangent)
    vertices=[p+r*(tangent*math.cos(i*2*math.pi/sides)+bitangent*math.sin(i*2*math.pi/sides)) for p in (a,b) for i in range(sides)]
    faces=[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    faces.extend([tuple(reversed(range(sides))),tuple(range(sides,sides*2))])
    o=mesh(name,vertices,faces,mat,solid=solid,rail_id=rail_id)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o

def rail(name, a,b, height=.7, mat=steel, grind=True):
    a,b=Vector(a),Vector(b)
    topa=a+Vector((0,0,height)); topb=b+Vector((0,0,height))
    tube(name+' / grind bar',topa,topb,.055,mat,10,solid=True,rail_id=name)
    length=(b-a).length
    for i in range(max(2,math.ceil(length/2.5))+1):
        t=i/max(2,math.ceil(length/2.5)); p=a.lerp(b,t)
        tube(name+' / support',p,p+Vector((0,0,height-.03)),.037,mat,solid=True,rail_id=name)
        box(name+' / foot',p+Vector((0,0,.025)),(.23,.23,.05),side,.01)
    if grind: rails.append({'name':name,'points':[[p.x,p.z,-p.y] for p in (topa,topb)],'radius':.055})

def transform(p,x,y,rot):
    a,b,z=p; c,s=math.cos(rot),math.sin(rot)
    return (x+a*c-b*s,y+a*s+b*c,z)

def quarter(name,x,y,width=9,run=3.5,height=3,rot=0,deck=1.7):
    original_run=run
    run*=RAMP_SCALE; height*=RAMP_SCALE
    # Keep coping/deck footprints while extending each named transition inward.
    # Apply this before batching, never by guessing ownership of individual vertices.
    extra=run-original_run
    tf=lambda p:transform((p[0],p[1]-extra,p[2]),x,y,rot)
    steps=22
    profile=[(run*math.sin(i/steps*math.pi/2),height*(1-math.cos(i/steps*math.pi/2))) for i in range(steps+1)]
    profile.append((run+deck,height))
    v=[tf((xx,yy,zz)) for xx in (-width/2,width/2) for yy,zz in profile]
    n=len(profile)
    f=[(i,i+n,i+n+1,i+1) for i in range(n-1)]
    mesh(name+' / transition',v,f,deckmat,True,True,[(xx/4,i/(n-2)*run/4) for xx in (-width/2,width/2) for i in range(n)])
    for xx in (-width/2,width/2):
        cap=[tf((xx,0,0)),tf((xx,run+deck,0))]+[tf((xx,yy,zz)) for yy,zz in reversed(profile[1:])]
        face=tuple(range(len(cap)))
        mesh(name+' / side frame',cap,[tuple(reversed(face)) if xx<0 else face],side,solid=True)
        for j in range(1,4):
            yy=(run+deck)*j/4
            rib_height=max(.12,height*(1-math.sqrt(max(0,1-min(yy/run,1)**2))))
            tube(name+' / rib',tf((xx,yy,0)),tf((xx,yy,rib_height)),.045,steel)
    mesh(name+' / rear', [tf((-width/2,run+deck,0)),tf((width/2,run+deck,0)),tf((width/2,run+deck,height)),tf((-width/2,run+deck,height))],[(0,1,2,3)],side,solid=True)
    tube(name+' / coping',tf((-width/2,run,height+.025)),tf((width/2,run,height+.025)),.06,steel,12)
    rails.append({'name':name+' coping','points':[[p[0],p[2],-p[1]] for p in [tf((-width/2,run,height+.025)),tf((width/2,run,height+.025))]],'radius':.06})
    rail(name+' / safety railing',tf((-width/2,run+deck-.12,height)),tf((width/2,run+deck-.12,height)),.95,steel,False)
    tube(name+' / lower guard',tf((-width/2,run+deck-.12,height+.45)),tf((width/2,run+deck-.12,height+.45)),.027,steel,solid=True)
    # Panel joins run continuously down the curved surface.
    for xx in np.arange(-width/2+1.5,width/2,1.5):
        for (yy,zz),(yy2,zz2) in zip(profile,profile[1:]):
            tube(name+' / panel seam',tf((xx,yy,zz+.006)),tf((xx,yy2,zz2+.006)),.006,dark,4)

# Bowl: an organic twin-lobed footprint, one continuous transition and an open flat bottom.
N=112; R=18; cx,cy=14,11
contour=[]
for j in range(N):
    t=2*math.pi*j/N
    contour.append((15*math.cos(t),7.4*math.sin(t)*(1-.24*math.exp(-(math.cos(t)/.36)**2))))
vs=[]; uv=[]
for i in range(R+1):
    t=i/R*math.pi/2; scale=.58+.42*math.sin(t); z=-2.65*math.cos(t)
    # Elliptical quarter-circle: flat tangent at bottom and vertical at the coping.
    z=-2.65+2.65*(1-math.cos(t))
    for j,(x,y) in enumerate(contour):
        vs.append((cx+x*scale,cy+y*scale,z)); uv.append((j/N*24,t*1.1))
faces=[]
for i in range(R):
    for j in range(N):
        k=(j+1)%N; faces.append((i*N+j,(i+1)*N+j,(i+1)*N+k,i*N+k))
mesh('01 / bowl continuous transition',vs,faces,bowlmat,True,True,uv)
mesh('01 / bowl flat bottom',[(cx+x*.58,cy+y*.58,-2.65) for x,y in contour],[tuple(range(N))],bowlmat,True)
for j,(x,y) in enumerate(contour):
    xn,yn=contour[(j+1)%N]
    tube('01 / bowl coping',(cx+x,cy+y,.025),(cx+xn,cy+yn,.025),.055,steel,8)
rails.append({'name':'Bowl coping loop','points':[[cx+x,.025,-cy-y] for x,y in contour]+[[cx+contour[0][0],.025,-cy-contour[0][1]]],'radius':.055})

# Ground apron constructed around the bowl opening, with no invisible floor across the bowl.
def hit_rect(x,y):
    candidates=[]
    if x>0:candidates.append(((34-cx)/x,0))
    if y>0:candidates.append(((23-cy)/y,1))
    if x<0:candidates.append(((-34-cx)/x,2))
    if y<0:candidates.append(((-23-cy)/y,3))
    d,s=min(candidates); return (cx+x*d,cy+y*d,0),s
corners={0:(34,23,0),1:(-34,23,0),2:(-34,-23,0),3:(34,-23,0)}
for j,(x,y) in enumerate(contour):
    xn,yn=contour[(j+1)%N]; a,sa=hit_rect(x,y); b,sb=hit_rect(xn,yn)
    v=[(cx+x,cy+y,0),a]
    if sa!=sb:v.append(corners[sa])
    v.extend([b,(cx+xn,cy+yn,0)])
    mesh('00 / concrete apron',v,[tuple(range(len(v)))],concrete,True)
for a,b in [((-34,-23,0),(34,-23,0)),((34,-23,0),(34,23,0)),((34,23,0),(-34,23,0)),((-34,23,0),(-34,-23,0))]:
    mesh('00 / foundation edge',[a,b,(b[0],b[1],-3.05),(a[0],a[1],-3.05)],[(0,3,2,1)],concrete)
box('00 / foundation underside',(0,0,-3.10),(68,46,.1),side)

# Tall western transition and the smaller rear mini-ramp.
quarter('02 / western vert wall',-27,-1,12,4.3,3.6,math.pi/2,1.8)
quarter('03 / rear mini north',-22,12.3,11,2.5,1.8,0,1.5)
quarter('03 / rear mini south',-22,9.2,11,2.5,1.8,math.pi,1.5)
box('03 / mini flat',(-22,10.75,-.024),(11,3.1-2*2.5*(RAMP_SCALE-1),.072),deckmat,skate=True)
quarter('04 / eastern quarter',29,-3.5,8,2.3,1.8,-math.pi/2,1.7)

def funbox(name,x,y,w,d,h,topw,topd):
    a,b=w/2,d/2; c,e=topw/2,topd/2
    v=[(x-a,y-b,0),(x+a,y-b,0),(x+a,y+b,0),(x-a,y+b,0),(x-c,y-e,h),(x+c,y-e,h),(x+c,y+e,h),(x-c,y+e,h)]
    mesh(name,v,[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],deckmat,True)
    for a,b in [(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7)]:tube(name+' / edge trim',v[a],v[b],.022,steel,6)

funbox('05 / west hip',-19,-5,8,7,1.35,3,1.5)
rail('05 / hip rail',(-19,-8.4,.05),(-19,-5.7,1.35),.62)
funbox('06 / center pyramid',-7,-5.5,9,7,1.25,3.5,2)
box('06 / hubba',(-7,-5.5,1.47),(.55,2.8,.44),concrete,.035,True)
tube('06 / hubba edge',(-7,-6.9,1.71),(-7,-4.1,1.71),.032,steel)
funbox('07 / east pyramid',7,-7,10,7,1.05,4,2)
box('07 / center ledge',(7,-7,1.34),(.65,3.2,.58),side,.045,True)
box('07 / ledge cap',(7,-7,1.65),(.73,3.28,.075),steel,.022,True)
rail('07 / angled rail',(9,-10.4,0),(9,-8,1.05),.55,red)

# Rear street platform, stair set, downrail, and hubba.
box('08 / street platform',(-8,15,.75),(6,8,1.5),concrete,.035,True)
for i in range(6):
    h=(i+1)*.25
    box('08 / stair %02d'%i,(-8,9+i*.35,h/2),(3.1,.35,h),concrete,.012,True)
    box('08 / stair nosing %02d'%i,(-8,8.833+i*.35,h+.004),(3.08,.025,.008),steel)
rail('08 / downrail',(-8,8.6,0),(-8,11.2,1.5),.8,red)
funbox('08 / transfer bank',-12,11,3,8,1.5,2,4)

# Long foreground deck, stairs, and banks, as in the reference.
box('09 / foreground deck',(-15,-19.2,.65),(26,2.8,1.3),deckmat,.025,True)
box('09 / foreground fascia',(-15,-20.65,.66),(26,.12,1.32),side,.02)
for x in np.arange(-27.5,-2.1,1.7):
    box('09 / exposed frame',(x,-20.76,.66),(.095,.08,1.27),steel,.015)
rail('09 / rear guard',(-28,-20.6,1.3),(-2,-20.6,1.3),.9,steel,False)
for i in range(5):
    h=1.3*(5-i)/5
    box('09 / exit stair',(-1.7+i*.38,-19.2,h/2),(.38,2.8,h),concrete,.015,True)
funbox('09 / exit bank',2,-19.2,4,2.8,1.3,.7,2.8)
tube('09 / deck coping',(-28,-17.77,1.33),(-2,-17.77,1.33),.05,steel)

funbox('10 / foreground spine',16,-19,9,3,1.0,1.0,2.9)
rail('10 / spine handrail',(16,-20.5,1),(16,-17.5,1),.65,steel)
funbox('11 / southeast bank',29,-18.5,6,5,1.15,1.6,3)
rail('11 / bank handrail',(26.1,-18.5,.04),(28.2,-18.5,1.15),.68,steel)
box('12 / low manual pad',(16,-12,.18),(4,1.7,.36),concrete,.055,True)
box('12 / pad steel cap',(16,-12,.38),(4.04,1.74,.055),steel,.02,True)
rail('13 / flat bar',(-6,2,0),(0,2,0),.55,red)

# Subtle concrete expansion cuts (front plaza only, avoiding bowl opening).
for x in range(-30,34,6):
    box('Concrete / expansion joint',(x,-9.8,.002),(.014,24.3,.004),dark)
for y in [-22,-16,-10,-4,2]:
    box('Concrete / expansion joint',(0,y,.003),(66,.014,.004),dark)

# Edge markings and low curbs replace the grass perimeter.
for x in [-33.4,33.4]: box('Perimeter / painted line',(x,0,.005),(.10,44,.01),white)
for y in [-22.4,22.4]: box('Perimeter / painted line',(0,y,.005),(66.8,.10,.01),white)
for x in [-33.8,33.8]: box('Perimeter / curb',(x,0,.1),(.38,46,.2),concrete,.035,skate=True)
for y in [-22.8,22.8]: box('Perimeter / curb',(0,y,.1),(68,.38,.2),concrete,.035,skate=True)

# Restrained industrial detail: lamps, benches, edge guards and drain grates.
for x,y in [(-31,-15),(-31,19),(0,21),(31,20),(31,-11),(8,-21)]:
    box('Lighting / plinth',(x,y,.15),(.52,.52,.3),concrete,.035,skate=True)
    tube('Lighting / mast',(x,y,.3),(x,y,7.8),.065,side,10,solid=True)
    tube('Lighting / crossbar',(x-.9,y,7.8),(x+.9,y,7.8),.045,side)
    for dx in [-.72,.72]:
        box('Lighting / flood housing',(x+dx,y,7.82),(.60,.35,.20),side,.04)
        box('Lighting / lens',(x+dx,y,7.71),(.50,.27,.015),lightmat,.01)
for x in [-15,-7,3]:
    for yy in [-.24,0,.24]: box('Furniture / bench slat',(x,21+yy,.48),(2,.19,.085),side,.025,skate=True)
    for dx in [-.72,.72]: box('Furniture / bench leg',(x+dx,21,.23),(.09,.65,.46),steel,.012,solid=True)
for x,y in [(-29,-11),(24,1),(1,-15),(-4,20)]:
    box('Drain / rim',(x,y,.004),(.65,1.1,.008),steel,.012)
    for dy in np.arange(-.45,.5,.11):box('Drain / slots',(x,y+dy,.01),(.48,.035,.008),dark)
for xa,xb,y in [(-30,-15,22),(-1,31,22)]:
    rail('Perimeter / guard',(xa,y,0),(xb,y,0),1.1,side,False)
    tube('Perimeter / middle rail',(xa,y,.52),(xb,y,.52),.025,side,solid=True)

# Named spawn and spatial data for future gameplay integration.
spawn=bpy.data.objects.new('Spawn / plaza',None); park.objects.link(spawn); spawn.location=(-13,-12,.15)
spawn['purpose']='Player spawn; faces north toward the central obstacles'

# Triangulate the deliverables and bake lightweight bevels into the visual mesh.
print('PARK: geometry created; preparing exports',flush=True)
bpy.context.view_layer.update()
for o in list(park.objects):
    if o.type!='MESH':continue
    bpy.context.view_layer.objects.active=o
    for mod in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
for o in collisions.objects:
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()

# Batch static visual geometry by material: retain the named editable source in the
# generator while keeping the shipped park's draw calls bounded.
groups={}
for o in list(park.objects):
    if o.type=='MESH': groups.setdefault(o.data.materials[0].name,[]).append(o)
for name,objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join();bpy.context.object.name='PARK / '+name
for o in collisions.objects:
    o.data.materials.clear()

def export_collection(col,path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects: o.hide_set(False); o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False)
    for o in col.objects:
        if col==collisions:o.hide_set(True)

export_collection(park,OUT/'insanity-inspired-park.glb')
export_collection(collisions,OUT/'park-collision.glb')
stats={'name':'Insanity-inspired StreetSkate Park','units':'metres','sizeMetres':[68,46],
       'referenceTriangles':1377312,'visualTriangles':sum(len(o.data.polygons) for o in park.objects if o.type=='MESH'),
       'collisionTriangles':sum(len(o.data.polygons) for o in collisions.objects if o.type=='MESH'),
       'visualObjects':sum(o.type=='MESH' for o in park.objects),'materials':len(bpy.data.materials),
       'source':'Original procedural reconstruction from the user-supplied reference image; no scan meshes or textures included.',
       'scaleNote':'Dimensions estimated for gameplay, not surveyed measurements.',
       'exclusions':['building','grass','photogrammetry textures'],
       'spawn':[-13,.15,12],'rails':rails,'transitionScale':RAMP_SCALE,
       'collisionVersion':2,'rampScaleBaked':True}
for filename in ['insanity-inspired-park.glb','park-collision.glb']:
    data=(OUT/filename).read_bytes();stats[filename]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
(OUT/'park-manifest.json').write_text(json.dumps(stats,indent=2))
if '--assets-only' in sys.argv:
    print('PARK_ASSETS_COMPLETE '+json.dumps({k:v for k,v in stats.items() if k!='rails'}),flush=True)
    sys.exit(0)

# Presentation scene; excluded from exported game asset.
world=bpy.data.worlds.new('Soft blue daylight');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.38,.48,.60,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.45
bpy.ops.object.light_add(type='SUN', location=(0,0,25));sun=bpy.context.object
sun.name='Preview / afternoon sun'; sun.rotation_euler=(math.radians(28),math.radians(-22),math.radians(-32));sun.data.energy=3;sun.data.angle=.10
bpy.ops.object.light_add(type='AREA',location=(-15,-10,35)); fill=bpy.context.object
fill.data.energy=2200;fill.data.shape='DISK';fill.data.size=35
bpy.ops.object.camera_add(location=(63,-78,68));cam=bpy.context.object
cam.name='Preview / overview';cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=91
scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
# A studio surface gives the park's cut foundation a clean, readable silhouette.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-3.18));stage=bpy.context.object
stage.name='Preview / studio floor';stage.data.materials.append(material('Preview / backdrop',(.21,.27,.29),.95))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'artifacts'/'streetskate-park.blend'))
scene.render.filepath=str(ROOT/'artifacts'/'park-overview.png');bpy.ops.render.render(write_still=True)
print('PARK_COMPLETE '+json.dumps(stats))
