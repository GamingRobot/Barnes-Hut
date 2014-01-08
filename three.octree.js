/**
 * A special scenegraph object to implement octree division for its children. 
 * This works for quadtrees and binary trees as well, just set the boundary box 
 * coordinates `-Infinity` and `Infinity`  for the dimension(s) you want to 
 * ignore.
 * 
 * @class Octree
 * @constructor
 * @extends THREE.Object3D
 * 
 * @author Monty Thibault
 * https://gist.github.com/MontyThibault/5000259t
**/
function Octree(box, config) {
    THREE.Object3D.call(this);

    this.divided = false;
    this.box = box || new THREE.Box3();
    
    this.config = config || {};
    this.config.maxDepth = this.config.maxDepth || 5;
    this.config.splitThreshold = this.config.splitThreshold || 10;
    this.config.joinThreshold =  this.config.joinThreshold || 5;
}

Octree.prototype = Object.create(THREE.Object3D.prototype);
Octree.prototype.constructor = Octree;

/**
 * Emulates the standard `object.add` API found in THREE.js. Automatically sorts
 * the object into the appropriate region of the tree.
 * 
 * @returns true on success, false if the object is not within bounds
**/
Octree.prototype.add = function(object, update) {
    if(this.box.containsPoint(object.position)) {
        if(this.divided) {
            var region;
            for(var i = 0; i < this.children.length; i++) {
                region = this.children[i];
                
                if(region.add(object, update)) {
                    return true;
                }
            }
        } else {
            THREE.Object3D.prototype.add.call(this, object);
            (update !== false) && this.update();
            return true;
        }
    }
    
    return false;
};

/**
 * Emulates the standard `object.remove` API found in THREE.js.
**/
Octree.prototype.remove = function(object, update) {
    if(object.parent !== this) {
        object.parent.remove(object, update);
        return;
    }
    
    THREE.Object3D.prototype.remove.call(this, object);
    if(this.parent instanceof Octree) {
        (update !== false) && this.parent.update();
    }
};

/**
 * Returns the region that the given point belongs to, without adding it as an 
 * object
**/
Octree.prototype.point = function(vec) {
    if(this.box.containsPoint(vec)) {
        if(this.divided) {
            var region;
            for(var i = 0; i < this.children.length; i++) {
                region = this.children[i].point(vec);
                if(region) {
                    return region;
                }
            }
        } else {
            return this;
        }
    }
    
    return false;
};

/**
 * Splits this object into several smaller regions and sorts children
 * appropriately. This only performs the operation 1 level deep.
**/
Octree.prototype.split = function() {
    if(this.divided || (this.config.maxDepth <= 1)) return false;
    
    var config = {
        joinThreshold: this.config.joinThreshold,
        splitThreshold: this.config.splitThreshold,
        maxDepth: this.config.maxDepth - 1
    };
    
    var regions = this.generateRegions(),
        objects = this.children;
        
    this.children = [];
    for(var i = 0; i < regions.length; i++) {
        THREE.Object3D.prototype.add.call(this, new Octree(regions[i], config));
    } 
    
    this.divided = true;
    for(i = 0; i < objects.length; i++) {
        objects[i].parent = undefined;
        this.add(objects[i], false);
    }
    
    return true;
};

/**
 * Merges child regions back into this one.
**/
Octree.prototype.join = function() {
    if(!this.divided) return false;
    
    var newChildren = [];
    for(var i = 0; i < this.children.length; i++) {
        this.children[i].join();
        newChildren = newChildren.concat(this.children[i].children);
    }
    
    this.children = newChildren;
    this.divided = false;
};

/**
 * Determines the new bounding boxes when this will be split. (8 octants if 
 * using an octree and 4 quadrants if using a quadtree)
**/
Octree.prototype.generateRegions = function() {
    var regions = [this.box.clone()],
        center = this.box.center(), 
        i, l, boxA, boxB;
    
    if(isFinite(this.box.max.x)) {
        boxA = regions[0];
        boxB = boxA.clone();

        boxA.max.x = center.x;
        boxB.min.x = center.x;
        
        // The first box is already part of the array
        regions.push(boxB);
    }
    
    if(isFinite(this.box.max.y)) {
        for(i = 0, l = regions.length; i < l; i++) {
            boxA = regions[i];
            boxB = boxA.clone();
            
            boxA.max.y = center.y;
            boxB.min.y = center.y;
            
            regions.push(boxB);
        }
    }
    
    if(isFinite(this.box.max.z)) {
        for(i = 0, l = regions.length; i < l; i++) {
            boxA = regions[i];
            boxB = boxA.clone();
            
            boxA.max.z = center.z;
            boxB.min.z = center.z;
            
            regions.push(boxB);
        }
    }
    
    return regions;
};
/**
 * Splits or joins the tree if there are too many/few children in this region.
**/
Octree.prototype.update = function() {
    var totalChildren = 0;
    
    if(this.divided) {
        for(var i = 0; i < this.children.length; i++) {
            totalChildren += this.children[i].update();
        }
        
        if(totalChildren <= this.config.joinThreshold) {
            this.join();
        }
    } else {
        totalChildren = this.children.length;
        
        if(totalChildren >= this.config.splitThreshold) {
            if(this.split()) {
                // If it split successfully, see if we can do it again
                this.update();
            }
        }
    }
    
    return totalChildren;
};

/**
 * Sorts object into the correct region. This should be called on objects that 
 * may have moved out of their regions since the last update. Since it will be
 * called frequently, this method does not update the octree structure.
**/
Octree.prototype.updateObject = function(object) {
    // If object is no longer inside this region
    if(!object.parent.box.containsPoint(object.position)) {
        object.parent.remove(object, false);
        
        // Loop through parent regions until the object is added successfully
        var oct = object.parent.parent;
        
        while(oct instanceof Octree) {
            if(oct.add(object, false)) {
                break;
            }
            oct = oct.parent;
        }
    }
};

/** 
 * Generates a wireframe object to visualize the tree.
**/
Octree.prototype.generateGeometry = function() {
    var container = new THREE.Object3D();
    var material = new THREE.MeshBasicMaterial({ 
        color: 0x000000, 
        wireframe: true });
    
    this.traverse(function(object) {
        if(object instanceof Octree) {
            var size = object.box.size(),
                center = object.box.center();
            
            var geo = new THREE.CubeGeometry(
                isFinite(size.x) ? size.x : 0, 
                isFinite(size.y) ? size.y : 0, 
                isFinite(size.z) ? size.z : 0, 
                1, 1, 1);
            
            var mesh = new THREE.Mesh(geo, material);
            mesh.position.set(
                isFinite(center.x) ? center.x : 0, 
                isFinite(center.y) ? center.y : 0, 
                isFinite(center.z) ? center.z : 0);
            
            container.add(mesh);
        } 
    });
    
    return container;
};